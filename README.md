# Examples: How to Get a GCP Access Token

This repo contains code examples that illustrate how to get a GCP access token programmatically.

Across all Google Cloud services, the programmatic interface to the control
plane - the API - is very similar and consistent. By "service" I refer to things like
Cloud service, Apigee, BigQuery, Cloud Storage, Cloud Logging, Cloud Run...

There's great deal of consistency in the API, in the shape of the request and response payloads,
the use of return status, the URL patterns, the api endpoint (always
_something_.googleapis.com), and of course the authentication.

For authentication, all of the _Google Cloud services_ require an OAuth2 access
token. And there are different options for how you obtain that token. This repo
covers some of that. First, some background.

## What does an access token look like?

There are different ways to get a token, but regardless of the way you choose,
the access token always looks similar.

It will look like:

```
ya29.a0AeTM1i..many..many..characters...CCePCQ0174
```

As far as I know, Google hasn't documented that officially as the structure of
the access token. It is _opaque_. It is not a JWT. In fact, the most you can
rely on is that the token will be a string of characters. The above example, a
string of characters that begins with `ya29.`, has been the basic structure, for
a long while now. But asfar as I know, that's not documented, and there's no
guarantee that will continue.

This is distinct from an ID token, which can also be issued by Google Cloud
token endpoints. The ID Token is a JWT.

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
that access token to authenticate the call.

If you are using curl, you should pass the token as a bearer token, in the
Authorization header, like so:

```sh
curl -i -H "Authorization: Bearer $TOKEN" https://SERVICE.googleapis.com/url/path
```

## Decoding tokens

There is no way to "decode" a GCP access token on your own. It kinda looks like
it might be a JWT, because it has dot-concatenated sections. But it is not
decodable by you; it's just an opaque string of characters. To use it, you need
to send it to a googleapis.com endpoint that knows what to do with it.

You can send the access token to the googleapis tokeninfo endpoint to ask Google
to tell you about it. Like so:

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

Those response payloads ALSO look kinda JWT-ish, but do not let this mislead
you. To repeat, the token is not a JWT.

As with JWT, the aud, sub, and azp attributes just identify the
audience, subject, and authorized party. Those are unique IDs for the Google
Cloud platform, for that particular principal.

## Access Tokens vs ID Tokens

For any principal, it is also possible to get a different kind of token - an ID
Token, also known as an identity token.  You can get an ID token for a user, or
for a service account.

Google APIs (*.googleapis.com) accept _access tokens_ when authorizing
administrative requests. But other systems might accept [_ID
tokens_](https://cloud.google.com/docs/authentication/get-id-token) as the
required credential.

Some examples here are the http-accessible endpoints for Cloud Run services, or Cloud
Functions that can be triggered via HTTP requests. If you configure your Cloud
Run service or your Cloud Function to NOT allow unauthenticated access (this is
the default when using the gcloud cli to deploy these things), then a caller
will need to provide an ID token, passed as a bearer token in the Authorization
header. And the principal identified by that token must have the appropriate
permissions on the service or function. In the case of Cloud Run, it's
`roles/run.invoker`; in the case of Cloud Functions, it's
`roles/cloudfunctions.invoker`.

In general the pattern is:

- If it's a builtin Google Cloud service, like PubSub, or FhirStore, or Cloud
  Logging, etc etc etc, basically any endpoint hosted at *.googleapis.com ,
  then you need to use an Access Token.

- If it's code that you've written and published, like with Cloud Run Services
  and Cloud Functions, then if you've enabled "Authorization", you should use an
  ID Token. (And possibly IAP)

So if you want your app to read or write to a Cloud Log, then you need an access token
for that. If you want to inquire or update the deployment status of an API
proxy, then you're invoking apigee.googleapis.com, which is a google service,
which means you need to use an Access Token.

And here's a subtlety - to CREATE a Run service or job, you will invoke
run.googleapis.com, which means you need an access token.  It's an
administrative function, and you're invoking a google-hosted API
(run.googleapis.com), therefore... access token.  If you are EXECUTING a Cloud
Run JOB, then... again you make that request administratively, by invoking
run.googleapis.com .  So, you know what that means; It's a google-hosted API and
that means use an Access Token.

Conversely if you are sending a REST request into a cloud run SERVICE, then it's
an ID token. You're not invoking run.googleapis.com; instead you're invoking
some-custom-domain.run.app , an endpoint at which your code is listening, hence
ID token.

For code that you write and then host in GKE, how you set up the security
requirements is up to you.  I suppose your code could require either an ID token
or an Access Token.  Or even something different, like HMAc-signed request
payloads, etc.

To get an ID token identifying YOU, with the gcloud command line tool, run this:
```
   gcloud auth print-identity-token
```

An ID Token _is_ a JWT, so you can decode it, verify the signature on it,
examine the claims in it, and so on.

OK that is all I have to say about ID Tokens. The rest of this document will
talk about access tokens.


## Using an access token

Earlier I described how to use the `/tokeninfo` endpoint to get information
about a token.  Needless to say, sending the access token to an endpoint that
merely gives you information about the token, is not the most interesting thing
you can do with a token.  More often you will be sending it to a googleapis.com
endpoint to perform some task related to managing cloud resources. In the Apigee
realm, that might be "deploy a proxy revision" or "create a new developer app"
etc, but it can be lots of other things, related to any other parts of Google
Cloud.  List cloud storage buckets, manage or access secrets, send payloads to
vertex AI, send a query to BigQuery, etc.

That assumes the principal (user or service account) has the appropriate
permissions for the requested action. The token is just an
[opaque](https://jpassing.com/2023/01/24/all-google-access-tokens-are-not-created-equal/)
string that allows Google Cloud to know the principal who requested it. Whether
that principal will be allowed (or authorized) depends on the IAM permissions
(and maybe rules!) that get applied on the Google Cloud side.

One principal may be granted read-only access to Google Cloud storage assets,
while another might have read/write
[permissions](https://cloud.google.com/storage/docs/access-control/iam-permissions).
There are loads of fine-grained permissions; these are typically grouped into
"roles" which then get applied to principals.  So userA might have role
["Storage Object
Creator"](https://cloud.google.com/storage/docs/access-control/iam-roles), which
grants permissions like { `storage.objects.create`,
`storage.managedFolders.create`, `storage.multipartUploads.create`... }. userB
might have a different set of roles, and different permissions.


## Three Ways to Get a Token

There are three ways to get an access token for services within GCP:

1. via interactive user login
2. via a service-account key and a special OAuthV2 grant
3. via a REST "shortcut", using the metadata endpoint for Google Compute Engine.

There are various libraries and frameworks , but basically they all are wrappers on the token dispensing APIs.

## The Metadata endpoint

The last way is the simplest: send a GET request to an endpoint and get a token back. Like this:

```sh
curl "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" \
-H "Metadata-Flavor: Google"
```

But the catch is, this works if and only if the command is run from a Google
Compute Engine (GCE) instance. It can be from a raw VM, or a Cloud Run app, or a
Cloud Shell instance... or an Apigee API!  This request gets a token for the
service account which is used by the GCE instance. You do not need to create or
download or reference a service account _key file_ for this to work. This call
won't work if you try invoking that endpoint from your laptop, or a build server
that runs outside of GCP.


## The other ways, via gcloud

The easiest way to get a GCP access token _for yourself_ is via the [gcloud
command-line tool](https://cloud.google.com/sdk/gcloud).  Install the tool, then
invoke:
```sh
gcloud auth login
```

...which starts an interactive user login, for the 3-legged OAuth2 grant.

After that completes, run this:
```sh
gcloud auth print-access-token
```

You will see the access token, which you can then use in curl commands, or in
postman, to tickle the various endpoints under googleapis.com .


You can also use gcloud to get a token on behalf of a service account, using a
downloaded service-account key file.  Rather than `gcloud auth login`, use this:

```sh
gcloud auth activate-service-account SERVICE_ACCOUNT@DOMAIN.COM --key-file=/path/key.json
```

This basically wraps the 2nd method I mentioned above.

Then, print the access token with:
```sh
gcloud auth print-access-token
```

The token will look the same as shown above, and can
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

Currently the examples use java, nodejs, bash, and dotnet. Most of them do not rely on the
Google-provided client libraries, just to make a point that you don't actually
need those client libraries.  You can invoke the token-dispensing endpoint
provided by Google Cloud, directly. I may add more examples later, maybe other
languages and so on.

I hope the code here will be valuable in two ways:

1. the code itself is reusable, can act as a starting point for people writing
   their own scripts

2. the code shows the API flow, the sequence of calls to make. So people can
   start from this working example and buid code for other scripting
   environments or platforms. Powershell, python, groovy, and etc.

There are currently these examples here:

* [**get-access-token-for-service-account.sh**](./sh/get-access-token-for-service-account.sh) - a bash script that gets
  an access token using a service account key (*see note below).

* [**getTokenWithUserAuth.js**](./node/getTokenWithUserAuth/getTokenWithUserAuth.js)- a [nodejs](https://nodejs.org/en/) script
  that gets an access token that is usable with Google APIs, using user
  authentication. This relies on a client that must be registered with Google IAM.

* [**getTokenWithServiceAccount.js**](./node/getTokenWithServiceAccount/getTokenWithServiceAccount.js) - a [nodejs](https://nodejs.org/en/)
  script that gets an access token that is usable with Google APIs, using a service
  account key. (*see note below).

* [**getToken.js**](./node/google-auth-library/getToken.js) - a [nodejs](https://nodejs.org/en/)
  script that gets an access token that is usable with Google APIs, using a service
  account key. (*see note below). This version uses the Google-provided [google-auth-library npm module](https://www.npmjs.com/package/google-auth-library).

* [**GetAccessTokenForServiceAccount**](./dotnet/GetAccessTokenForServiceAccount) - a
  [dotnet](https://dotnet.microsoft.com/en-us/download) program that gets an
  access token that is usable with Google APIs, using a service account key. (*see note
  below).

* [**GetTokenWithServiceAccount.java**](./java/src/main/java/com.google.examples.tokens/GetTokenWithServiceAccount.java) - a
  java program that gets an
  access token that is usable with Google APIs, using a service account key. (*see note
  below).


The two methods for acquiring tokens - via user authentication or using a
service account identity - are intended for different purposes, and you should
take care to decide which one to use. If you are in doubt review your
use case with your security architect, or consult [the decision
tree](https://cloud.google.com/docs/authentication#auth-decision-tree).

> * Note: using any of the service account samples requires a service account key
  file in JSON format, containing the private key of the service account. Be aware that [Google recommends against](https://cloud.google.com/docs/authentication#auth-decision-tree) creating and downloading service account keys, if you can avoid it.

In a typical case, a CI/CD pipeline might
use a service account. But if you're just automating Google things (including
apigee.googleapis.com) for your own purposes, for example via a script you run
from your own terminal, you probably want to use the human authentication to get
the token. It's important because the audit trail will identify YOU as the
person doing the work.  Regardless which case you use, the result is an access
token, which looks and works the same after you acquire it.

## (nodejs) getTokenWithUserAuth

This shows case 1 from above - getting a token for an authenticated user.

To set this up, you need to set up a client credential. (When using gcloud, as described above, gcloud employs its own client credential.)

To get a client credential, follow these one-time steps:

1. visit console.cloud.google.com

2. select your desired "project".  Service accounts are maintained within the scope of a GCP project.

3. Using the hamburger navigation icon in the upper left-hand-side of the screen, Navigate to "APIs & Services".

4. Again using the LHS nav, Click "Credentials" (You may need to configure the OAuth Consent Screen to allow this all to happen)

5. at the top of the page, click "+ CREATE CREDENTIALS"

5. you may have to configure the "Consent Screen" at this point if you have not done so already.

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

That is all one-time work. (For the curious, all of this has been "done for you"
if you are using the gcloud command line tool. When you use `gcloud auth
print-access-token`, it is using it's own app, it's own `client_id` and
`client_secret` etc., that has been previously provisioned.)


Now, to get a token , you can do the following as many times as you like:

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

   The script will exchange the code for a token**.  The response looks like this:

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


**The "exchange the code for a token" is normally a thing that a user must
participate in.  The user needs to view the code on the browser tab, then
copy/paste the code into the console app prompt, and then the exchange
happens. But this script tries to automate that by starting a local http server
that retrieves the code automatically and eliminates the need for that manual
copy/paste experience.


## (bash) get-access-token-for-service-account.sh

This shows case 2 from above - getting a token for a service account, in this
case, from a bash script.

The pre-requisities here are:
* curl
* base64
* date, sed, tr
* openssl

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

That thing is a secret. Protect it as such.

That is all one-time setup stuff.

Now, when you need a new access token, run the script:

```sh
cd sh
./get-access-token-for-service-account.sh ~/Downloads/my-service-account-key.json
```



## (nodejs) getTokenWithServiceAccount

This shows case 2 from above - getting a token for a service account, in this
case, from a nodejs script.

You need a service account key json file. To get it, follow the steps to
generate and download a json key file, as described for the bash example for
service accounts above. If you've already done it for the bash example, you do
not need to repeat that setup for this example.

Now, as often as you need to create a token, run these steps:

1. invoke the node script specifying the downloaded key file
   ```sh
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

The pre-req here is the dotnet SDK, v8 or later.  Install that on your machine. On MacOS, I
did this via homebrew:

```
brew install --cask dotnet-sdk
```

On Windows, I just downloaded the .NETSDK v8.0 and installed it.

You need a service account key json file. To get it, follow the steps to
generate and download a json key file, as described for the bash example for
service accounts above. If you've already done it for the bash example, you do
not need to repeat that setup for this example.

Then, build and run the app. Follow these steps. I tested this on MacOS and Windows.

1. verify your dotnet version
   ```
   cd dotnet/GetAccessTokenForServiceAccount
   dotnet --version
   ```

   I built and tested this with version `8.0.401`.

2. install pre-requisites
   ```
   dotnet add package System.IdentityModel.Tokens.Jwt
   ```

   Make sure this part succeeds before proceeding.

2. build
   ```
   dotnet build
   ```

   This should show you some happy messages.

3. run
   ```
   bin/Debug/net8.0/Get-GCP-Token  --sakeyfile ~/Downloads/my-downloaded-key-file.json --verbose
   ```

   The result should show you an access token, something like this:
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
   bin/Debug/net8.0/Get-GCP-Token \
     --roll-forward \
     --sakeyfile ~/Downloads/my-downloaded-key-file.json
   ```

## (java) GetTokenWithServiceAccount.java

The pre-requisite here is a JDK v11 or later. And you need Apache maven v3.9 or later

You need a service account key json file. To get it, follow the steps to
generate and download a json key file, as described for the bash example for
service accounts above. If you've already done it for the bash example, you do
not need to repeat that setup for this example.

Then, build and run the app. Follow these steps. I tested this on MacOS.

1. verify your java version
   ```
   cd java
   javac --version
   ```

   You should see v11.0.22 or later

2. and verify your version of maven
   ```
   mvn --version
   ```

   You should see `Apache Maven 3.9.0` or later

3. build
   ```
   mvn clean package
   ```

   This should show you some happy messages.

3. run
   ```
   java -jar ./target/get-gcp-access-token-1.0.1.jar --creds YOUR_KEY_FILE.json

   ```

   The result should be a token:
   ```
   ya29.c.b0AXv0zTPIXDh-FGN_hM4e..many-characters..jN8H3fp50U
   ```

   You can then use that token as a Bearer token in API calls to
   `*.googleapis.com` , subject to the roles and permissions the service account
   has.

   You can also tell the program to send the token to the tokeninfo endpoint:
   ```
   java -jar ./target/get-gcp-access-token-1.0.1.jar --creds YOUR_KEY_FILE.json --inquire
   ```

   ...and you should see the token info output.


## Disclaimer

This example is not an official Google product, nor is it part of an
official Google product.

## License

This material is [Copyright 2021-2024 Google LLC](./NOTICE).
and is licensed under the [Apache 2.0 License](LICENSE).


## Support

The examples here are open-source software.
If you need assistance, you can try inquiring on [Google Cloud Community
forum dedicated to Apigee](https://www.googlecloudcommunity.com/gc/Apigee/bd-p/cloud-apigee).
There is no service-level guarantee for
responses to inquiries regarding this example.
