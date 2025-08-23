"use client";
import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 bg-red-500 text-white min-h-screen">
        {/* Logo oben links */}
        <div className="p-6 flex items-center">
          <img src="/logo.png" alt="DROP" className="h-4 w-auto select-none" />
        </div>

        {/* Content mittig */}
        <div className="flex items-center justify-center px-6" style={{ minHeight: "calc(100vh - 96px)" }}>
          <div className="flex flex-col items-center text-center gap-6">
            <img
              src="/headline.png"
              alt="GET YOUR DROP"
              className="w-full h-auto max-w-[720px] md:max-w-[900px] lg:max-w-[1024px] select-none"
            />
            <button
              className="px-16 py-3 text-base rounded-full bg-white text-black font-semibold shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black"
              onClick={() => router.push("/drop")}
            >
              Enter
            </button>
          </div>
        </div>
      </div>
      <footer className="bg-black text-white py-24 flex items-center justify-center">
        <p className="text-lg">Footer content</p>
      </footer>
    </div>
  );
}