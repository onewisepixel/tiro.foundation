import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MemoryDetail from "@/components/MemoryDetail";
import { getMemoryById, memories } from "@/data/memories";

type Params = {
  id: string;
};

type PageProps = {
  params: Promise<Params>;
};

export function generateStaticParams() {
  return memories.map((memory) => ({ id: memory.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const memory = getMemoryById(id);

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

export default async function MemoryDetailRoute({ params }: PageProps) {
  const { id } = await params;
  const memory = getMemoryById(id);

  if (!memory) {
    notFound();
  }

  return <MemoryDetail memory={memory} />;
}
