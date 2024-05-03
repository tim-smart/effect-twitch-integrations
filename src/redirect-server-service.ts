import { BunHttpServer } from "@effect/platform-bun";
import * as Http from "@effect/platform/HttpServer";
import * as Schema from "@effect/schema/Schema";
import { randomBytes } from "crypto";
import { Context, Deferred, Effect, Layer } from "effect";
import {
  RedirectServerConfig,
  RedirectServerPort,
} from "./spotify-config-service";

const make = Effect.gen(function* () {
  const config = yield* RedirectServerConfig;

  const mailbox = yield* Deferred.make<string, Error>();
  const csrfToken = randomBytes(256).toString("hex");

  const getParams = Http.request.schemaSearchParams(
    Schema.Struct({
      code: Schema.NonEmpty,
      state: Schema.NonEmpty,
    })
  );

  yield* Http.router.empty.pipe(
    Http.router.get("/ping", Http.response.text("pong")),
    Http.router.get(
      `/${config.path}`,
      Effect.gen(function* () {
        const { code } = yield* getParams;
        yield* Deferred.succeed(mailbox, code);
        return Http.response.text("success");
      })
    ),
    Effect.catchTags({
      RouteNotFound: () => Http.response.empty({ status: 404 }),
    }),
    Http.server.serveEffect(Http.middleware.logger)
  );

  return { csrfToken, code: Deferred.await(mailbox) } as const;
});

export class RedirectServer extends Context.Tag("redirect-server")<
  RedirectServer,
  Effect.Effect.Success<typeof make>
>() {
  static Live = Layer.scoped(RedirectServer, make).pipe(
    Layer.provide(
      BunHttpServer.server.layerConfig({
        port: RedirectServerPort,
      })
    )
  );
}
