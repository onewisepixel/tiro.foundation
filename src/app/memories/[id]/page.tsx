import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MemoryDetail from "@/components/MemoryDetail";
import { getMemoryById, memories } from "@/data/memories";

type Params = {
  id: string;
};

export function generateStaticParams() {
  return memories.map((memory) => ({ id: memory.id }));
}

export function generateMetadata({
  params,
}: {
  params: Params;
}): Metadata {
  const memory = getMemoryById(params.id);

  if (!memory) {
    return {
      title: "Memory Not Found — The Tiro Foundation",
      description: "Requested memory record does not exist.",
    };
  }

  return {
    title: `${memory.title} — The Tiro Foundation`,
    description: memory.summary,
  };
}

export default function MemoryDetailRoute({ params }: { params: Params }) {
  const memory = getMemoryById(params.id);

  if (!memory) {
    notFound();
  }

  return <MemoryDetail memory={memory} />;
}
