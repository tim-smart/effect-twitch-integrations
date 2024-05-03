import type { AccessToken } from "@spotify/web-api-ts-sdk";
import { Config } from "effect";
import AccessTokenJson from "./do_not_open_on_stream/access-token.json";

// TODO Schema decode
const accessToken: AccessToken = AccessTokenJson as unknown as AccessToken;

export const SpotifyConfig = Config.all({
  clientId: Config.string("CLIENT_ID"),
  clientSecret: Config.secret("CLIENT_SECRET"),
  accessToken: Config.succeed(accessToken),
}).pipe(Config.nested("SPOTIFY"));

export const RedirectServerPort = Config.number("REDIRECT_SERVER_PORT").pipe(
  Config.withDefault(3939)
);

export const RedirectServerConfig = Config.all({
  port: RedirectServerPort,
  path: Config.string("REDIRECT_SERVER_PATH").pipe(
    Config.withDefault("redirect")
  ),
});
