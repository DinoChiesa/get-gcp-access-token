// Copyright © 2024 Google LLC.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

// created: Thu Mar  7 15:54:00 2024
// last saved: <2024-August-20 15:35:15>

/* jshint esversion:9, node:true, strict:implied */
/* global process, console, Buffer */

import { JWT } from "google-auth-library";
import { Command } from "commander";
import fs from "fs";
import util from "util";
import fetch from "node-fetch";

// "https://www.googleapis.com/auth/spreadsheets"
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";

(async function () {
  const program = new Command();

  program
    .requiredOption("--creds <file>", "Service Account credentials file")
    .option(
      "--url <url>",
      "googleapis.com url to GET with resulting authentication"
    );

  program.parse();

  const options = program.opts();
  const keyfile = JSON.parse(fs.readFileSync(options.creds, "utf8"));

  const serviceAccountAuth = new JWT({
    email: keyfile.client_email,
    key: keyfile.private_key,
    scopes: [SCOPE]
  });

  const credentials = await serviceAccountAuth.authorize();
  console.log("credentials: " + util.format(credentials) + "\n");

  const response = options.url
      ? await fetch(options.url, {
          method: "get",
          body: null,
          headers: {
            Authorization: `Bearer ${credentials.access_token}`,
            "Content-Type": "application/json"
          }
        })
      : await fetch(
          `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${credentials.access_token}`,
          {
            method: "get",
            body: null,
            headers: {}
          }
        ),
    body = await response.json();

  console.log(JSON.stringify(body, null, 2));
})();
