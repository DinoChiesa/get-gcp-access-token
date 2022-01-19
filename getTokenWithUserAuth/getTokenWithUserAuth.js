// getTokenWithUserAuth.js
// ------------------------------------------------------------------
//
// created: Thu Nov  7 09:01:30 2019
// last saved: <2022-January-18 16:22:26>

/* jshint esversion:9, node:true, strict:implied */
/* global process, console, Buffer */

// This works. The token stash is indexed with the concatenation of the clientid and the user id.

const util           = require('util'),
      https          = require('https'),
      url            = require('url'),
      open           = require('open'),
      fs             = require('fs'),
      path           = require('path'),
      readline       = require('readline'),
      querystring    = require('querystring'),
      tokenStashPath = resolveTilde('~/.gcp-token-stash.json'),
      REQUIRED_SCOPES = ['https://www.googleapis.com/auth/cloud-platform', 'email'],
      OOB_REDIRECT   = 'urn:ietf:wg:oauth:2.0:oob';

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
          redirect_uri: OOB_REDIRECT,
          grant_type:'authorization_code'
        };
  return formRequest(options, options.clientCredentials.token_uri,
                     formParams);
}

const getStashKey = (options) => options.clientCredentials.client_id + '##' + options.user;

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
  console.log('This script will now open a browser tab. After granting consent, you will');
  console.log('receive a one-time code. Return here and paste it in, to continue....\n');

  // https://accounts.google.com/o/oauth2/v2/auth?
  //  scope=email%20profile&
  //  response_type=code&
  //  state=security_token%3D138r5719ru3e1%26url%3Dhttps%3A%2F%2Foauth2.example.com%2Ftoken&
  //  redirect_uri=urn%3Aietf%3Awg%3Aoauth%3A2.0%3Aoob&
  //  client_id=client_id

  return sleep(4200)
    .then(() => {
      const qparams = {
              scope: REQUIRED_SCOPES.join(' '),
              response_type: 'code',
              state: randomString(),
              redirect_uri: OOB_REDIRECT,
              client_id : options.clientCredentials.client_id
            };
      const authUrl = options.clientCredentials.auth_uri + '?' + querystring.stringify(qparams);
      // Authorize this app by visiting the url
      if (options.verbose) {
        logWrite(`opening ${authUrl} ...`);
      }
      open(authUrl, {wait: false});
      return new Promise((resolve, reject) => {
        const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
              });
        rl.question('Paste the one-time-code: ', (code) => {
          rl.close();
          resolve(exchangeCodeForToken(options, code));
        });
      });
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
      if (stashed[key]) {
        // If we have an access_token, let's just unilaterally try to refresh it.
        // There's an expiry, but ... not a huge cost to just refreshing.
        return refreshToken(options, stashed[key]);
      }
      return newAuthorization(options);
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
              `    --verbose    you know.\n`);

}

function main(args) {
  try {
    let options = processArgs(args);
    if (options && options.credsFile) {
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
