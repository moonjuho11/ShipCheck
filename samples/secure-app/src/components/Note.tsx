"use client";
import DOMPurify from "dompurify";

export default function Note({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />;
}
