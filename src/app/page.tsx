import Hypersphere from "@/components/Hypersphere";

export default function Home() {
  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col h-screen bg-[#0b0c10] text-white">
        <div className="h-1/2 w-full">
          <Hypersphere />
        </div>

        <div className="h-1/2 flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-4xl font-semibold mb-4">The Tiro Foundation</h1>
          <p className="text-lg max-w-xl mb-6">
            There is enlightenment in exploration, but empathy is essential.
          </p>
          <input
            type="email"
            placeholder="Enter your email to stay connected"
            className="px-4 py-2 w-full max-w-md rounded text-black mb-4"
          />
          <button className="bg-white text-black px-6 py-2 rounded hover:bg-gray-300 transition">
            Notify Me Now!
          </button>
        </div>
      </main>
      
    </div>
  );
}
