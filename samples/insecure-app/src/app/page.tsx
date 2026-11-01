import Comment from "@/components/Comment";

export default function Home() {
  return (
    <main>
      <h1>TaskPal</h1>
      <Comment comment={{ author: "sam", body: "<b>hello</b>" }} />
    </main>
  );
}
