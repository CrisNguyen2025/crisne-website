import { Metadata } from 'next';
import { MappingFlowClient } from './MappingFlowClient';

export const metadata: Metadata = {
  title: 'Mapping Flow',
  description: 'Document and track flow between FE, BA, and BE',
};

export default function MappingFlowPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-[#121212]">
      <MappingFlowClient />
    </main>
  );
}
