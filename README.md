# Examples: How to Get a GCP Access Token

This repo contains examples that illustrate how to get a GCP access token from code.

The goal is to just show how it is possible. What endpoints to use, How to
request the right scopes, what credentials are necessary, and so on.

Initially the examples will use nodejs and the builtin `https` module.
I may add more examples later as time permits.

I hope the code here will be valuable in two ways:

1. the code itself is reusable, can act as a starting point for people writing
   their own scripts

2. the code shows the API flow, the sequence of calls to make. So people can
   start from this working example and buid code for other scripting
   environments or platforms. Powershell, python, and etc.

There are currently two examples:

* **getTokenWithUserAuth** - gets an OAuth token usable with Google APIs, based
  on user authentication. This uses a client that must be registered with Google
  IAM.

* **getTokenWithServiceAccount** - gets an OAuth token usable with Google APIs,
  based on service account authentication. This requires a service account .json
  file, containing the private key of the service account.

Both of these examples require a recent version of
[node](https://nodejs.org/en/) (which should include npm).

The two methods for acquiring tokens are intended for different purposes, and
you should take care to decide which one to use, carefully. If you are in doubt
review your use case with your security architect. In a typical case, a CI/CD
pipeline might use a service account. But if you're just automating Google
things (including apigee.googleapis.com) for your own purposes you probably want
to use the human authentication to get the token. Regardless which case you use,
the result is an OAuth token, which looks and works the same after you acquire
it.

## getTokenWithUserAuth

To set this up, you need a client credential.

Follow these steps:

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

9. invoke the script, specifying the credentials file you downloaded:
   ```
   cd getTokenWithUserAuth
   npm install
   node ./getTokenWithUserAuth.js -v  \
       --client_credentials ./downloaded-client-config-file.json
   ```

9. The script should open a browser tab and ask you to sign in with
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


## getTokenWithServiceAccount

To set up, you need a service account JSON file containing the private key of
the service account.

Follow these steps:

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

9. invoke the node script using that key
   ```
   cd getTokenWithServiceAccount
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
