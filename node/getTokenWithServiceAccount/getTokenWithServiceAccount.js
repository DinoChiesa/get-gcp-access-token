// getTokenWithServiceAccount.js
// ------------------------------------------------------------------

// uses only modules that are builtin to node, no external dependencies.

/* jshint esversion:9, node:true, strict:implied */
/* global process, console, Buffer */

const crypto = require('crypto'),
      util = require('util'),
      url = require('url'),
      fs = require('fs'),
      path = require('path'),
      https = require('https');

const requiredScopes = 'https://www.googleapis.com/auth/cloud-platform',
      grant_type = 'urn:ietf:params:oauth:grant-type:jwt-bearer';

function logWrite() {
  console.log(util.format.apply(null, arguments) + '\n');
}

function httpRequest({verbose, req}) {
  if (verbose) {
    logWrite('%s %s', req.method.toUpperCase(), req.url);
  }
  return new Promise((resolve, reject) => {
    let parsed = url.parse(req.url),
        options = {
          host: parsed.host,
          path: parsed.path,
          method : req.method,
          headers : req.headers
        },
        request = https.request(options, (res) => {
          let payload = '';
          if (verbose) {
            logWrite('%d', res.statusCode);
          }
          res.on('data', chunk => payload += chunk);
          res.on('end', () => resolve(JSON.parse(payload)));
          res.on('error', e => reject(e));
        });
    if (req.body) {
      request.write(req.body);
    }
    request.end();
  });
}

const toBase64UrlNoPadding =
  s => s.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const base64EncodeString =
  theString => toBase64UrlNoPadding(Buffer.from(theString).toString('base64'));

function signJwt(header, payload, key) {
  if ( ! header.alg) {
    throw new Error("missing alg");
  }
  if (header.alg != 'RS256') {
    throw new Error('unhandled alg: ' + header.alg);
  }
  let signer = crypto.createSign('sha256');
  let signatureBase =
    [header, payload]
      .map( x => base64EncodeString(JSON.stringify(x)) )
      .join('.');
  signer.update(signatureBase);
  let computedSignature = toBase64UrlNoPadding(signer.sign(key, 'base64'));
  return signatureBase + '.' + computedSignature;
}

function getGoogleAuthJwt({options}) {
  let keyfile = options.keyfile,
      nowInSeconds = Math.floor(Date.now() / 1000),
      jwtHeader = { alg : 'RS256', typ : 'JWT' },
      jwtClaims = {
        iss   : keyfile.client_email,
        aud   : keyfile.token_uri,
        iat   : nowInSeconds,
        exp   : nowInSeconds + 60,
        scope : requiredScopes
      };
  if (options.verbose) {
    logWrite('jwt payload: ' + JSON.stringify(jwtClaims, null, 2));
  }
  return Promise.resolve({
    options,
    assertion: signJwt(jwtHeader, jwtClaims, keyfile.private_key)
  });
}

function redeemJwtForAccessToken(ctx) {
  if (ctx.options.verbose) {
    logWrite('assertion: ' + util.format(ctx.assertion));
  }
  let req = {
        url : ctx.options.keyfile.token_uri,
        headers : {
          'content-type': 'application/x-www-form-urlencoded'
        },
        method : 'post',
        body : `grant_type=${grant_type}&assertion=${ctx.assertion}`
      };
  return httpRequest({verbose:ctx.options.verbose, req});
}

function processArgs(args) {
  let awaiting = null, options = {};
  try {
    args.forEach((arg) => {
      if (awaiting) {
        if (awaiting == '--keyfile') {
          options.keyfile = arg;
          awaiting = null;
        }
        else {
          throw new Error(`I'm confused: ${arg}`);
        }
      }
      else {
        switch(arg) {
        case '--keyfile':
          if (options.keyfile) {
            throw new Error('duplicate argument: ' + arg);
          }
          awaiting = arg;
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
  console.log(`usage:\n  node ${basename} --keyfile SERVICE_ACCOUNT_KEYFILE\n`);
}

function main(args) {
  try {
    let options = processArgs(args);
    if (options && options.keyfile) {
      options.keyfile = JSON.parse(fs.readFileSync(options.keyfile, 'utf8'));
      if ( ! options.keyfile.client_email || !options.keyfile.token_uri) {
        throw new Error('that does not look like a Service Account key file.');
      }
      getGoogleAuthJwt({options})
        .then(redeemJwtForAccessToken)
        .then(payload => console.log(JSON.stringify(payload, null, 2)))
        .catch( e => console.log(util.format(e)));
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
