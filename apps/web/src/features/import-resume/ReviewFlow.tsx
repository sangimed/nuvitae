"use client";

import { ReviewStep } from "./ReviewStep";

export function ReviewFlow(props: { readonly importId: string }) {
  return <ReviewStep importId={props.importId} />;
}
