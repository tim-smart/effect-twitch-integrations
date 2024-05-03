import * as Http from "@effect/platform/HttpClient";
import { SpotifyApi, type AccessToken } from "@spotify/web-api-ts-sdk";
import { Context, Data, Effect, Layer, Queue, Secret } from "effect";
import { Message, MessagePubSub } from "./message-pubsub";
import { RedirectServerConfig, SpotifyConfig } from "./spotify-config-service";
import { Schema } from "@effect/schema";

export class SpotifyError extends Data.TaggedError("SpotifyError")<{
  cause: unknown;
}> {}

const make = Effect.gen(function* () {
  const config = yield* SpotifyConfig;

  const client = SpotifyApi.withAccessToken(
    config.clientId,
    config.accessToken
  );
  const use = <A>(f: (client: SpotifyApi) => Promise<A>) =>
    Effect.tryPromise({
      try: () => f(client),
      catch: (cause) => new SpotifyError({ cause }),
    });

  return { use, client } as const;
});

export class SpotifyApiClient extends Context.Tag("spotify-api-client")<
  SpotifyApiClient,
  Effect.Effect.Success<typeof make>
>() {
  static Live = Layer.scoped(this, make);
}

export const SpotifyService = Layer.scopedDiscard(
  Effect.gen(function* () {
    yield* Effect.logInfo("starting spotify service");
    const api = yield* SpotifyApiClient;
    const pubsub = yield* MessagePubSub;

    const dequeue = yield* pubsub.subscribeTo("CurrentlyPlayingRequest");

    yield* Effect.forkScoped(
      Effect.forever(
        Effect.gen(function* () {
          yield* Effect.logInfo("starting CurrentlyPlayingRequest listener");
          // todo: reccommend takeWhen
          yield* Queue.take(dequeue);
          yield* Effect.logInfo("received CurrentlyPlayingRequest listener");

          const { item } = yield* api.use((_) =>
            _.player.getCurrentlyPlayingTrack(undefined)
          );

          yield* Effect.logInfo("resolved spotify api request");

          if (!("album" in item)) {
            yield* Effect.logWarning(`Invalid Spotify Track Item`);
            return;
          }

          yield* Effect.logInfo("publishing currently playing");
          yield* pubsub.publish(Message.CurrentlyPlaying({ song: item }));
        })
      )
    );
  })
).pipe(Layer.provide(SpotifyApiClient.Live), Layer.provide(MessagePubSub.Live));

const AccessToken = Schema.Struct({
  access_token: Schema.String,
  token_type: Schema.String,
  expires_in: Schema.Number,
  refresh_token: Schema.String,
  expires: Schema.optional(Schema.Number),
});

export function requestAccessToken(code: string) {
  return Effect.gen(function* (_) {
    const spotify = yield* SpotifyConfig;
    const config = yield* RedirectServerConfig;

    const token = yield* _(
      Http.request.post("https://accounts.spotify.com/api/token"),
      Http.request.basicAuth(
        spotify.clientId,
        Secret.value(spotify.clientSecret)
      ),
      Http.request.urlParamsBody({
        code,
        redirect_uri: `http://localhost:${config.port}/${config.path}`,
        grant_type: "authorization_code",
      }),
      Http.client.fetchOk,
      Http.response.schemaBodyJsonScoped(AccessToken)
    );

    return token;
  });
}
