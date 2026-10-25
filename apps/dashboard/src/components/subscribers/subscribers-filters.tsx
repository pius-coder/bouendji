"use client";

import { useQueryStates } from "nuqs";
import { SearchBox } from "@/components/page/search-box";
import { subscribersParsers, subscribersUrlKeys } from "@/server/query/subscribers.params";
import { SUBSCRIBERS_SEARCH_LABEL } from "./subscribers-columns";

export function SubscribersFilters() {
  const [{ q }, setParams] = useQueryStates(subscribersParsers, {
    urlKeys: subscribersUrlKeys,
    shallow: false,
    history: "replace",
    clearOnDefault: true,
  });
  return (
    <SearchBox
      label={SUBSCRIBERS_SEARCH_LABEL}
      placeholder={SUBSCRIBERS_SEARCH_LABEL}
      value={q}
      onCommit={(next) => setParams({ q: next })}
    />
  );
}
