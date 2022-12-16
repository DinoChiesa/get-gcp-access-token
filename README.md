# Examples: How to Get a GCP Access Token

This repo contains code examples that illustrate how to get a GCP access token programmatically.

## What does a token look like?

There are different ways to get a token, but regardless of the way you choose,
the token always looks similar.

It will look like:

```
ya29.a0AeTM1i..many..many..characters...CCePCQ0174
```

As far as I know, Google hasn't documented that officially as the structure of
the token. It is _opaque_. In fact, the most you can rely on is that the token
will be a string of characters. The above example, a string of characters that
begins with `ya29.`, has been the basic structure, for a long while now. But
there's no guarantee that will continue.


## What are tokens good for?

An access token is required to invoke calls on any endpoint on
googleapis.com. To configure or administer any service in GCP, you need to send
REST calls to googleapis.com .  The endpoints for the various services are
distinct.  For example:

| service        | endpoint                |
|----------------|-------------------------|
| Compute Engine | compute.googleapis.com  |
| Storage        | storage.googleapis.com  |
| Apigee         | apigee.googleapis.com   |
| BigQuery       | bigquery.googleapis.com |
| Logging        | logging.googleapis.com  |
| many more..... |                         |


This is just standard Google Cloud stuff. Even with Apigee hybrid, in which the
gateways can run externally to Google Cloud (let's say in AWS EKS), the control
plane is in Google Cloud, and you must configure Apigee hybrid by interacting
with the control plane endpoint at apigee.googleapis.com. In all cases, you need
that access token to authorize the call.

If you are using curl, you should pass the token as a bearer token, in the
Authorization header, like so:

```sh
curl -i -H "Authorization: Bearer $TOKEN" https://SERVICE.googleapis.com/url/path
```

## Decoding tokens

There is no way to "decode" a GCP access token on your own. It kinda looks like it might be a JWT, because it has dot-concatenated sections. But it is not decodable; it's just an opaque string
of characters to you. To use it, you need to send it to a googleapis.com endpoint
that knows what to do with it.

You can send the access token to the googleapis tokeninfo endpoint to ask Google
to tell you about it.  Like so:

```
curl -i https://www.googleapis.com/oauth2/v3/tokeninfo\?access_token=$TOKEN
```

For a user-based access token, the response will give expiry, email, audience, scope, etc. Like so:
```
{
  "azp": "32555940559.apps.googleusercontent.com",
  "aud": "32555940559.apps.googleusercontent.com",
  "sub": "112026411584569361827",
  "scope": "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/appengine.admin https://www.googleapis.com/auth/sqlservice.login https://www.googleapis.com/auth/compute https://www.googleapis.com/auth/accounts.reauth",
  "exp": "1670604242",
  "expires_in": "3320",
  "email": "person@zone.example.com",
  "email_verified": "true",
  "access_type": "offline"
}
```

For an access token granted to a service-account, the response will be like this:

```
{
  "azp": "102362795548081388936",
  "aud": "102362795548081388936",
  "scope": "https://www.googleapis.com/auth/cloud-platform",
  "expires_in": 3551,
  "access_type": "online"
}
```

The aud, sub, and azp attributes just identify the audience, subject, and
authorized party. Those are unique IDs for the Google Cloud platform, for that
particular principal.

More often you will not be sending the access token to an endpoint that merely
gives you information about the token.  More often you will be sending it to a
googleapis.com endpoint to perform some task related to managing cloud
resources. In the Apigee realm, that might be "deploy a proxy revision", but it
can be lots of other things, related to other parts of Google Cloud.

## Three Ways to Get a Token

There are three ways to get an access token for services within GCP:

1. via interactive user login
2. via a service-account key and a special OAuthV2 grant
3. via a "shortcut", using the metadata endpoint for Google Compute Engine.

## The Metadata endpoint

The last way is the simplest: send a GET request to an endpoint and get a token back. Like this:
```
curl "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" \
-H "Metadata-Flavor: Google"
```

But the catch is, this works if and only if the command is run from a Google
Compute Engine instance. It gets a token for the service account which is used
by the GCE instance.  You do not need to create or download a service account
key file for this to work.  This call won't work if you try invoking that
endpoint from your laptop, or a build server that runs outside of GCP.


## The other ways, via gcloud

The easiest way to get a GCP access token _for yourself_ is via the [gcloud
command-line tool](https://cloud.google.com/sdk/gcloud).  Install the tool, then
invoke `gcloud auth login` followed by `gcloud auth print-access-token`.  You
will see the access token, which you can then use in curl commands, or in
postman, to tickle the various endpoints under googleapis.com .


You can also use gcloud to get a token on behalf of a service account, using a
downloaded service-account key file.  Rather than `gcloud auth login`, use
`gcloud auth activate-service-account SERVICE_ACCOUNT@DOMAIN.COM
--key-file=/path/key.json` and then again print the access token with `gcloud
auth print-access-token`.  The token will look the same as shown above, and can
be used in the same way. Subject to permissions associated to the service
account, of course.


## Getting a token using your own code

In some cases you may want to get a token without relying on gcloud, and your
code may not be running in GCE.

The code in this repository just shows how this is possible. It will show what
endpoints to use, How to request the right scopes, what credentials are
necessary, and so on. I don't have any particuar insider knowledge of how gcloud
is implemented, but I feel confident that gcloud invokes the same endpoints these
example programs use, to get tokens.

Currently the examples use nodejs and dotnet. They do not rely on the
Google-provided client libraries, just to make a point that you don't actually
need those client libraries.  I may add more examples later, maybe other
languages and so on, as time permits.

I hope the code here will be valuable in two ways:

1. the code itself is reusable, can act as a starting point for people writing
   their own scripts

2. the code shows the API flow, the sequence of calls to make. So people can
   start from this working example and buid code for other scripting
   environments or platforms. Powershell, python, and etc.

There are currently these examples here:

* **(nodejs) getTokenWithUserAuth** - gets an OAuth token usable with Google APIs, based
  on user authentication. This uses a client that must be registered with Google
  IAM.

* **(nodejs) getTokenWithServiceAccount** - gets an OAuth token usable with Google APIs,
  based on service account authentication. This requires a service account .json
  file, containing the private key of the service account.

* **(dotnet) GetAccessTokenForServiceAccount** - gets an OAuth token usable with Google APIs,
  based on service account authentication. This requires a service account .json
  file, containing the private key of the service account.

All of these examples require a recent version of the underlying framework, whether
[node](https://nodejs.org/en/) or [dotnet](https://dotnet.microsoft.com/en-us/download).

The two methods for acquiring tokens - via user authentication or using a
service account identity - are intended for different purposes, and you should
take care to decide which one to use, carefully. If you are in doubt review your
use case with your security architect. In a typical case, a CI/CD pipeline might
use a service account. But if you're just automating Google things (including
apigee.googleapis.com) for your own purposes, for example via a script you run
from your own terminal, you probably want to use the human authentication to get
the token. It's important because the audit trail will identify YOU as the
person doing the work.  Regardless which case you use, the result is an OAuth
token, which looks and works the same after you acquire it.

## (nodejs) getTokenWithUserAuth

This shows case 1 from above - getting a token for an authenticated user.

To set this up, you need to set up a client credential. (When using gcloud, as described above, gcloud employs its own client credential.)

To get a client credential, follow these one-time steps:

1. visit console.cloud.google.com

2. select your desired "project".  Service accounts are maintained within the scope of a GCP project.

3. Using the left-hand-side, Navigate to "APIs & Services".

4. Again using the LHS nav, Click "Credentials" (You may need to configure the OAuth Consent Screen to allow this all to happen)

5. at the top of the page, click "+ CREATE CREDENTIAL"

6. click "OAuth client ID"

7. Specify "Desktop app".

8. name it, and create it. Register at least one user for this app.

9. Download the JSON for the client into a credentials file. The result is something like this:
   ```json
   {
     "installed": {
       "client_id": "714366284403-fp4a.apps.googleusercontent.com",
       "project_id": "my-project-id",
       "auth_uri": "https://accounts.google.com/o/oauth2/auth",
       "token_uri": "https://oauth2.googleapis.com/token",
       "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
       "client_secret": "GOX-DMAJZkF9hN-wyL_wvRO",
       "redirect_uris": [
         "http://localhost"
       ]
     }
   }
   ```


That is all one-time work.  Now, to get a token , you can do the following as many times as you like:

1. invoke the script, specifying the credentials file you downloaded:
   ```
   cd node/getTokenWithUserAuth
   npm install
   node ./getTokenWithUserAuth.js -v  \
       --client_credentials ./downloaded-client-config-file.json
   ```

2. The script should open a browser tab and ask you to sign in with
   Google.

   ![Example](./images/sign-in-with-google.png)

   After you sign-in, the web UI will ask you to grant consent with a
   similar-looking dialog.  When you consent, the Google token service will
   generate and return a single-use authorization code to the script. The web
   page will show a page reading: "OK. You can now close this browser tab."

   The script will exchange the code for a token.  The response looks like this:

   ```json
   {
     "access_token": "ya29.c.b0AXv0zTPIXDh-FGN_hM4e....jN8H3fp50U............",
     "expires_in": 3599,
     "token_type": "Bearer",
      ...
   }
   ```

   You can then use that access_token as a Bearer token in API calls to
   `*.googleapis.com` , subject to the roles and permissions the authenticated
   user has.


## (nodejs) getTokenWithServiceAccount

This shows case 2 from above - getting a token for a service account.

To set up, you need a service account JSON file containing the private key of
the service account.

Follow these steps for the one-time setup:

1. visit console.cloud.google.com

2. select your desired "project".  Service accounts are maintained within the scope of a GCP project.


3. Using the left-hand-side, Navigate to "IAM & Admin".

4. Again using the LHS nav, Click "Service Accounts"

5. Create a new service account, or select a pre-existing one to use.

6. Once created, select the service account

7. In the "Service account details" panel, select the KEYS tab

8. Add a new Key, create new key

9. select JSON

9. Create

9. download the JSON file to your local workstation. The result is something like this:
   ```json
   {
     "type": "service_account",
     "project_id": "projectname1",
     "private_key_id": "93158289b2734d823aaeba3b1e4a48a15aaac",
     "client_email": "service_acct_name@projectname1.iam.gserviceaccount.com",
     "client_id": "1167082158558367844",
     "auth_uri": "https://accounts.google.com/o/oauth2/auth",
     "token_uri": "https://oauth2.googleapis.com/token",
     "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
     "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/service_acct_name%40projectname1.iam.gserviceaccount.com",
     "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQE...8K5WjX\n-----END PRIVATE KEY-----\n"
   }
   ```


That is all one-time setup stuff. Now, as often as you need to create a token, run these steps:

1. invoke the node script specifying the downloaded key file
   ```
   cd node/getTokenWithServiceAccount
   npm install
   node ./getTokenWithServiceAccount.js -v  --keyfile ~/Downloads/my-service-account-key.json
   ```

   The result will be a JSON response shaped something like this:

   ```json
   {
     "access_token": "ya29.c.b0AXv0zTPIXDh-FGN_hM4e....jN8H3fp50U............",
     "expires_in": 3599,
     "token_type": "Bearer"
   }
   ```

   You can then use that token as a Bearer token in API calls to
   `*.googleapis.com` , subject to the roles and permissions the service account
   has.


## (dotnet) GetAccessTokenForServiceAccount

The pre-req here is the dotnet SDK.  Install that on your machine. On MacOS, I
did this via homebrew:

```
brew install --cask dotnet-sdk
```

Then, do the same setup as is described for the nodejs example for service
accounts above. You need the service account key json file. If you've already
done it for the nodejs example, you do not need to repeat that setup to use the
dotnet app.

Then, build and run the app:

1. verify your dotnet version
   ```
   cd dotnetcore/GetAccessTokenForServiceAccount
   dotnet --version
   ```

   I built and tested this with version `7.0.101`.

2. install pre-requisites
   ```
   dotnet add package Microsoft.IdentityModel.JsonWebTokens
   dotnet add package System.Security.Cryptography.Algorithms
   ```

2. build
   ```
   dotnet build
   ```

   This should show you some happy messages.

3. run
   ```
   bin/Debug/netcoreapp3.1/Get-GCP-Token  --sakeyfile ~/Downloads/my-downloaded-key-file.json
   ```

   The result should be a token:
   ```
   ya29.c.b0AXv0zTPIXDh-FGN_hM4e..many-characters..jN8H3fp50U
   ```

   You can then use that token as a Bearer token in API calls to
   `*.googleapis.com` , subject to the roles and permissions the service account
   has.

   If you get a message like
   ```
   You must install or update .NET to run this application.
   ```
   ..then you may be able to avoid that by invoking the command with the `--roll-forward` option:

   ```
   bin/Debug/netcoreapp3.1/Get-GCP-Token \
     --roll-forward \
     --sakeyfile ~/Downloads/my-downloaded-key-file.json
   ```



## Disclaimer

This example is not an official Google product, nor is it part of an
official Google product.

## License

This material is [Copyright 2021-2022 Google LLC](./NOTICE).
and is licensed under the [Apache 2.0 License](LICENSE).


## Support

This example is open-source software.
If you need assistance, you can try inquiring on [Google Cloud Community
forum dedicated to Apigee](https://www.googlecloudcommunity.com/gc/Apigee/bd-p/cloud-apigee).
There is no service-level guarantee for
responses to inquiries regarding this example.
