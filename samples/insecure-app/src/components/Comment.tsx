"use client";

type Props = { comment: { author: string; body: string } };

export default function Comment({ comment }: Props) {
  return (
    <div className="comment">
      <strong>{comment.author}</strong>
      {/* PLANTED: renders user-written HTML without sanitizing */}
      <div dangerouslySetInnerHTML={{ __html: comment.body }} />
    </div>
  );
}
