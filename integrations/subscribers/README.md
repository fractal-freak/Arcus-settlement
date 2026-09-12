# Subscriber population

One occupied subscriber row means one resident. Count increases create fictional births; decreases mark departures while retaining citizen history. Claude-session archaeologists use the existing `people` feed and are independent.

The source sheet remains private. A bound Apps Script returns only `{"count":123}`. `Code.gs` expects a header named Email, Email address, or Subscriber email in the first row of tab gid=0; verify that against the source before deploying. Empty rows are ignored, and each occupied identity row counts once.

Deploy the reviewed script from that sheet as a web app that executes as the owner and exposes the aggregate response. The user must authorize Google's requested access. Do not make the subscriber sheet public.

Store the deployed HTTPS URL in the ignored `.local/subscribers.json` as `{"url":"DEPLOYED_URL"}`, or set `SUBSCRIBER_COUNT_URL`. A persistent local hub calling this repository's `life()` refreshes it at most once a minute. `sim/tick.mjs` awaits the refresh before advancing the simulation; the existing published-site workflow refreshes every half hour. This is polling, not a push webhook.

Only the validated count and check time are saved to `state/subscribers.json`. Errors and inaccessible sources retain the last confirmed count. Until the source is configured, the existing population remains; it is not presented as a verified subscriber count.

For GitHub Actions, set the `SUBSCRIBER_COUNT_URL` repository secret. No Google credentials or subscriber rows belong in this repository.
