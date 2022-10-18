// getTokenWithUserAuth.js
// ------------------------------------------------------------------
//
// created: Thu Nov  7 09:01:30 2019
// last saved: <2022-October-17 17:29:37>

/* jshint esversion:9, node:true, strict:implied */
/* global process, console, Buffer */

const util           = require('util'),
      https          = require('https'),
      url            = require('url'),
      open           = require('open'),
      fs             = require('fs'),
      path           = require('path'),
      querystring    = require('querystring'),
      // The token stash is indexed with the concatenation of the clientid and the user id.
      tokenStashPath = resolveTilde('~/.gcp-token-stash.json'),
      REQUIRED_SCOPES = ['https://www.googleapis.com/auth/cloud-platform', 'email'],
      //LOOPBACK_REDIRECT   = 'urn:ietf:wg:oauth:2.0:oob';
      LOCAL_HTTP_LISTENER_PORT = 11890,
      LOOPBACK_REDIRECT   = `http://127.0.0.1:${LOCAL_HTTP_LISTENER_PORT}`;

function randomString(L) {
  L = L || 18;
  let s = '';
  do {s += Math.random().toString(36).substring(2, 15); } while (s.length < L);
  return s.substring(0,L);
}

function resolveTilde(srcPath) {
  const os = require('os');
  if (srcPath.startsWith('~/') || srcPath === '~') {
    return srcPath.replace('~', os.homedir());
  }
  if (srcPath.startsWith('~')) {
  const path = require('path');
    return path.resolve(os.homedir() + '/../' + srcPath.slice(1));
  }
  return srcPath;
}

function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

function logWrite() {
  var time = (new Date()).toString(),
      tstr = '[' + time.substr(11, 4) + '-' +
    time.substr(4, 3) + '-' + time.substr(8, 2) + ' ' +
    time.substr(16, 8) + '] ';
  console.log(tstr + util.format.apply(null, arguments));
}

function formRequest(options, uri, formParams) {
  return new Promise((resolve, reject) => {
    let parsed = url.parse(uri),
        httpOptions = {
          host: parsed.host,
          path: parsed.path,
          method : 'POST',
          headers : {
            accept : 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        },
        requestPayload = querystring.stringify(formParams);
    if (options.verbose){
      logWrite(`${httpOptions.method} ${uri}`);
      Object.keys(httpOptions.headers).forEach( key =>
                                        logWrite(`${key}: ${httpOptions.headers[key]}`));
      logWrite(``);
      logWrite(`${requestPayload}`);
    }

    let request = https.request(httpOptions, function(res) {
          let responsePayload = '';
          res.on('data', chunk => responsePayload += chunk);
          res.on('end', () => {
            if (options.verbose){
              logWrite(`response: ${responsePayload}`);
            }
            return resolve(JSON.parse(responsePayload));
          });
          res.on('error', e => reject(e));
        });
    request.write(requestPayload);
    request.end();
  });
}

function exchangeCodeForToken(options, code) {
    // POST /token HTTP/1.1
    // Host: oauth2.googleapis.com
    // Content-Type: application/x-www-form-urlencoded
    //
    // code=4/P7q7W91a-oMsCeLvIaQm6bTrgtp7&
    // client_id=your_client_id&
    // client_secret=your_client_secret&
    // redirect_uri=urn%3Aietf%3Awg%3Aoauth%3A2.0%3Aoob%3Aauto&
    // grant_type=authorization_code

    let formParams = {
          code,
          client_id: options.clientCredentials.client_id,
          client_secret: options.clientCredentials.client_secret,
          redirect_uri: LOOPBACK_REDIRECT,
          grant_type:'authorization_code'
        };
  return formRequest(options, options.clientCredentials.token_uri,
                     formParams);
}

const getStashKey = (options) => options.user && (options.clientCredentials.client_id + '##' + options.user);

function refreshToken(options, stashed) {
  let formParams = {
        client_id: options.clientCredentials.client_id,
        client_secret: options.clientCredentials.client_secret,
        refresh_token: stashed.refresh_token,
        grant_type:'refresh_token'
      };
  return formRequest(options, options.clientCredentials.token_uri, formParams)
    .then(tokenResponse => {
      tokenResponse.refresh_token = stashed.refresh_token;
      return tokenResponse;
    });
}

function newAuthorization(options) {
  console.log('\nYou must authorize this app before using it.\n');
  console.log('This script will now open a browser tab. After you grant consent, ');
  console.log('return here and you will see the access token.\n');

  // https://accounts.google.com/o/oauth2/v2/auth?
  //  scope=email%20profile&
  //  response_type=code&
  //  state=security_token%3D138r5719ru3e1%26url%3Dhttps%3A%2F%2Foauth2.example.com%2Ftoken&
  //  redirect_uri=http://127.0.0.1:PORT&
  //  client_id=client_id

  const startLocalHttpServer = () =>
  new Promise((resolve,reject) => {
    const http = require('http');
    const stoppable = require('stoppable');
    const requestHandler = (request, response) => {
            const url = require('url');
            // eg,
            // url: '/?state=a7n22mglioio7xexnd&code=4/0ARtbsbAALw&scope=email%20https://www.googleapis.com/auth/cloud-platform%20https://www.googleapis.com/auth/userinfo.email%20openid&authuser=0&hd=dchiesa.altostrat.com&prompt=consent';
            let u = url.parse(request.url);
            if (u.query && !server.retrievedQuery) {
              server.retrievedQuery = querystring.parse(u.query);
              if (options.verbose) {
                logWrite(`retrieved query:\n` + JSON.stringify(server.retrievedQuery, null, 2));
              }
              response.writeHead(302, { 'Location': '/ok' });
              return response.end();
            }

            response.writeHead(200, { 'content-type': 'text/html'});
            response.write('<!DOCTYPE html>\n<html><body><h1>OK. You can now close this browser tab.</h1></body></html>');
            response.end();
          };
    const server = stoppable(http.createServer(requestHandler), 10);
    server.listen(LOCAL_HTTP_LISTENER_PORT);
    resolve(server);
  });

  const stopLocalHttpServer = (server, cb) => {
          if (server) {
            server.stop((e, g) => {
              gracefully = g;
              cb(server);
            });
          }
          return cb(null);
        };

  let timerControl = {};
  const cycleTime = 300;
  const waitForPredicate = (predicate, waitLimit, cb, controlKey) => {
          controlKey = controlKey || Math.random().toString(36).substring(2,15);

          let control = timerControl[controlKey];
          let found = predicate();

          if (found) {
            if (control && control.interval) {
              clearInterval(control.interval);
              delete timerControl[controlKey];
            }
            return cb(found);
          }

          if ( ! control) {
            let interval = setInterval ( function () {
              waitForPredicate(predicate, waitLimit, cb, controlKey);
                }, cycleTime);
            timerControl[controlKey] = { interval, totalWaited:0 };
          }
          else {
            timerControl[controlKey].totalWaited += cycleTime;
            if (timerControl[controlKey].totalWaited > waitLimit) {
              clearInterval(control.interval);
              delete timerControl[controlKey];
              return cb(null);
            }
          }
        };

  return sleep(4200)
    .then(startLocalHttpServer)
    .then(localServer => {
      const qparams = {
              scope: REQUIRED_SCOPES.join(' '),
              response_type: 'code',
              state: randomString(),
              redirect_uri: LOOPBACK_REDIRECT,
              client_id : options.clientCredentials.client_id
            };
      const authUrl = options.clientCredentials.auth_uri + '?' + querystring.stringify(qparams);
      // Authorize this app by visiting the url
      if (options.verbose) {
        logWrite(`opening ${authUrl} ...`);
      }
      open(authUrl, {wait: false});
      const SECONDS_TO_WAIT_FOR_USER = 20;
      return sleep(3200)
        .then ( () =>
                new Promise((resolve, reject) => {
                  let predicate = () => localServer && localServer.retrievedQuery;

                  waitForPredicate(predicate, SECONDS_TO_WAIT_FOR_USER * 1000, (retrievedQuery) => {
                    stopLocalHttpServer(localServer, () => {
                      if (retrievedQuery && retrievedQuery.code) {
                        resolve(exchangeCodeForToken(options, retrievedQuery.code));
                      }
                      else {
                        reject(new Error('Timed out waiting for code'));
                      }
                    });
                  });
                })
                .catch(e => {
                  console.log(e);
                  return stopLocalHttpServer(localServer,  () => {});
                }));
    });
}

function getTokenStash(options) {
  return new Promise( (resolve, reject) => {
    let stashed = {};
    if (options.nostash) {
      if (options.verbose){
        console.log(`ignoring token stash...`);
      }
      return resolve(stashed);
    }
    return fs.readFile(tokenStashPath, (e, stashed) => {
      if ( ! e) {
        try {
          stashed = JSON.parse(stashed);
          resolve(stashed);
        }
        catch (exc1) {
          console.log("Exception while reading token stash file:" + util.format(exc1));
          reject(exc1);
        }
      }
      else {
        reject(e);
      }
    });
  });
}

function stashToken(options) {
  return tokenResponse =>
  // tokenResponse holds an opaque access_token that has been issued by googleapis.com.
  // {
  //   "access_token": "ya29.c.abcdefg",
  //   "expires_in": 3599,
  //   "token_type": "Bearer"
  //   ....
  // }
  getTokenStash(options)
    .then(stashed => {
      if (options.nostash) { return tokenResponse; }
      if ( ! tokenResponse.expires_in) { return tokenResponse; }
      let key = getStashKey(options);
      let now = new Date();
      let nowAsMillisSinceEpoch = now.valueOf();
      tokenResponse.issued = nowAsMillisSinceEpoch;
      tokenResponse.issuedFormatted = now.toISOString();

      const expiryAsMillisSinceEpoch = nowAsMillisSinceEpoch + (1000 * Number(tokenResponse.expires_in));

      const expiryDateObj = new Date(expiryAsMillisSinceEpoch);
      tokenResponse.expires = expiryDateObj.valueOf();
      tokenResponse.expiresFormatted = expiryDateObj.toISOString();

      stashed[key] = tokenResponse;
      if (options.verbose){
        console.log(`stashing token under ${key}`);
      }
      fs.writeFile(tokenStashPath, JSON.stringify(stashed, null, 2) + '\n', (e) => {
        if (e) console.error(e); // this is a non-fatal condition
      });
      console.log();
      return tokenResponse;
    });
}

function getCredential(options) {
  return getTokenStash(options)
    .then(stashed => {
      let key = getStashKey(options);
      if (key && stashed[key]) {
        // If we have an access_token, let's just unilaterally try to refresh it.
        // There's an expiry, but ... not a huge cost to just try to refresh.
        return refreshToken(options, stashed[key]);
      }
      return newAuthorization(options);
    })
    .then(tokenResponse => {
      if (tokenResponse.id_token) {
        // get the user from here
        let parts = tokenResponse.id_token.split('.', 3);
        options.user =
          JSON.parse(Buffer.from(parts[1],'base64').toString('utf-8')).email;
      }
      return tokenResponse;
    })
    .then(stashToken(options));
}

function processArgs(args) {
  let awaiting = null, options = {};
  try {
    args.forEach((arg) => {
      if (awaiting) {
        if (awaiting == '--client_credentials') {
          options.credsFile = arg;
          awaiting = null;
        }
        else if (awaiting == '--user') {
          options.user = arg;
          awaiting = null;
        }
        else {
          throw new Error(`I'm confused: ${arg}`);
        }
      }
      else {
        switch(arg) {
        case '--client_credentials':
          if (options.credsFile) {
            throw new Error('duplicate argument: ' + arg);
          }
          awaiting = arg;
          break;
        case '--user':
          if (options.user) {
            throw new Error('duplicate argument: ' + arg);
          }
          awaiting = arg;
          break;
        case '--nostash':
          if (options.nostash) {
            throw new Error('duplicate argument: ' + arg);
          }
          options.nostash = true;
          break;
        case '-v':
        case '--verbose':
          options.verbose = true;
          break;
        case '-h':
        case '--help':
          options.help = true;
          return;
        default:
          throw new Error('unexpected argument: ' + arg);
        }
      }
    });
    return options;
  }
  catch (exc1) {
    console.log("Exception:" + util.format(exc1));
    return;
  }
}

function usage() {
  let basename = path.basename(process.argv[1]);
  console.log(`usage:\n  node ${basename} --client_credentials CREDS_FILE --user USER\n`);
  console.log(`  options:`);
  console.log(`    --nostash    do not use (read or write) the token stash file\n` +
              `    --user USER  specify the user to stash the token for. Used only if not --nostash\n` +
              `    --help       show this.\n` +
              `    --verbose    you know.\n`);

}

function main(args) {
  try {
    let options = processArgs(args);
    if (options && options.help) {
      usage();
    }
    else if (options && options.credsFile) {
      options.credsFile = path.resolve(resolveTilde(options.credsFile));
      if ( ! fs.existsSync(options.credsFile)) {
        console.log("That file does not exist");
      }
      options.clientCredentials = require(options.credsFile).installed;

      getCredential(options)
        .then(payload => console.log(JSON.stringify(payload, null, 2)))
        .catch( e => console.log('Error!\n' + util.format(e)));
    }
    else {
      usage();
    }
  }
  catch(e) {
    console.log("Exception:" + util.format(e));
  }
}

main(process.argv.slice(2));
