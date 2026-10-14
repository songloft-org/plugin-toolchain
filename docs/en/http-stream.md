# Cancellable HTTP body reads

`@songloft/plugin-sdk` exports `HTTPStream`, `HTTPStreamResponse`, and `HTTPStreamOptions`. Optional `songloft.net.httpStream` typing accommodates older hosts. The [host API guide](https://github.com/songloft-org/songloft/blob/main/docs/en/js-plugin-development-guide.md#songloftnethttpstream--cancellable-http-body-reads) defines the contract, permissions, limits, and example.

Run `npm run typecheck` and `npm run build` in `packages/plugin-sdk/`. Local development may pack the SDK and install it in test dependencies; do not put `/tmp` or `file:` dependencies in release manifests or lockfiles. Consumers need a matching SDK release before adopting the new types.
