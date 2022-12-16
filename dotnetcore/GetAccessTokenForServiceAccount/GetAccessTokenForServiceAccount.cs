// Copyright 2018-2022 Google Inc.
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

using System;
using System.Net.Http;
using System.IO;
using System.Text;
using System.Text.Json;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Collections.Generic;
using System.Security.Claims;
using System.Security.Cryptography;


namespace Google.AccessTokensExamples.ServiceAccount
{
  class GetToken
  {
    string _scope = "https://www.googleapis.com/auth/cloud-platform";
    string _grant_type = "urn:ietf:params:oauth:grant-type:jwt-bearer";
    string _saCredsFilename;
    const int _lifetimeInSeconds = 60;
    bool _verbose = false;

    public static void Main(string[] args)
    {
      try
      {
        new GetToken(args).Run();
      }
      catch (System.Exception exc1)
      {
        Console.WriteLine("Exception: {0}", exc1.ToString());
        Usage();
      }
    }

    public static void Usage()
    {
      Console.WriteLine("\nGetToken: get an access token for a service account, given SA credentials.\n");
      Console.WriteLine("Usage:\n  GetToken --sakeyfile <sa-json-file> [--scope <desired scope>]");
    }

    public GetToken (string[] args)
    {
      for (int i=0; i < args.Length; i++)
      {
        switch (args[i])
        {
          case "--scope":
            i++;
            if (args.Length <= i) throw new ArgumentException(args[i]);
            _scope = args[i];
            break;

          case "--sakeyfile":
            i++;
            if (args.Length <= i) throw new ArgumentException(args[i]);
            _saCredsFilename = args[i];
            break;

          case "--verbose":
            _verbose = false;
            break;

          case "-?":
            throw new ArgumentException(args[i]);

          default:
            throw new ArgumentException(args[i]);
        }
      }

      if (_saCredsFilename == null) {
        throw new ArgumentException("--sakeyfile");
      }
    }

    JwtSecurityToken GenerateToken(Dictionary<string, string> sakeyjson)
    {
      var pem = sakeyjson["private_key"];

      var base64String =
        pem.Replace("-----BEGIN PRIVATE KEY-----", "")
        .Replace("-----END PRIVATE KEY-----", "")
        .Trim();

      var rsakey = RSA.Create();

      rsakey.ImportPkcs8PrivateKey(Convert.FromBase64String(base64String), out _);

      SecurityKey securityKey = new RsaSecurityKey(rsakey);
      var now = DateTime.UtcNow;
      var signingCredentials = new SigningCredentials(securityKey, "RS256");

      var header = new JwtHeader(signingCredentials);
      var t = DateTime.UtcNow - new DateTime(1970, 1, 1);

      int iat = (int)t.TotalSeconds;
      var payload = new JwtPayload
      {
        { "iss", sakeyjson["client_email"]},
        { "iat", iat },
        { "aud", sakeyjson["token_uri"] },
        { "exp", iat + _lifetimeInSeconds},
        { "scope", _scope }
      };

      return new JwtSecurityToken(header, payload);
    }

    string RequestAccessToken(string tokenString, string uri)
    {
      using (var httpClient = new HttpClient())
      {
        var formparams = new Dictionary<string, string>();
        formparams.Add("assertion", tokenString);
        formparams.Add("grant_type", _grant_type);

        HttpResponseMessage response = httpClient.PostAsync(uri, new FormUrlEncodedContent(formparams)).Result;
        var responseBody = response.Content.ReadAsStringAsync().Result;
        return responseBody;
      }
    }


    void Run()
    {
      var sakeyjson = JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(_saCredsFilename));

      var token = GenerateToken(sakeyjson);

      var tokenHandler = new JwtSecurityTokenHandler();
      var tokenString = tokenHandler.WriteToken(token);
      if (_verbose)
      {
      Console.WriteLine("\ntoken:\n" + tokenString);

      var decodedToken = tokenHandler.ReadToken(tokenString);
      Console.WriteLine("\nDecoded: \n"+ decodedToken);
      }
      var response = RequestAccessToken(tokenString, sakeyjson["token_uri"]);
      if (_verbose)
      {
      Console.WriteLine("\nResponse: \n"+ response);

      }

      // use Dictionary<string,Object> here because the expires_in is a number.
      var responseJson = JsonSerializer.Deserialize<Dictionary<string, Object>>(response);
      var accessToken = responseJson["access_token"].ToString().TrimEnd('.');
      if (_verbose)
      {
      Console.WriteLine("\naccess_token: \n"+ accessToken);

      }
      else
      {
      Console.WriteLine(accessToken);

      }
    }
  }
}
