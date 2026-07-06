'use client';

import dynamic from 'next/dynamic';

const MappingFlowContainer = dynamic(
  () => import('@/components/mapping-flow/MappingFlowContainer').then(mod => mod.MappingFlowContainer),
  { ssr: false }
);

export function MappingFlowClient() {
  return <MappingFlowContainer />;
}
