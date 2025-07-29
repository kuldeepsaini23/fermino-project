import Link from "next/link";

export default function Home() {
  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <div className="flex gap-3 items-center">
        <Link
          href={"/stream"}
          className="px-4 py-2 border border-input rounded-md"
        >
          Stream
        </Link>
        <Link
          href={"/watch"}
          className="px-4 py-2 border border-input rounded-md"
        >
          Watch
        </Link>
      </div>
    </div>
  );
}
