import { NextResponse } from 'next/server';
import { generateOpenApiSpec } from '@/lib/knowledge/openapi';

export async function GET() {
  try {
    const spec = generateOpenApiSpec();
    return NextResponse.json(spec, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'OPENAPI_SPEC_ERROR',
          message: error?.message || 'Failed to generate OpenAPI specification'
        }
      },
      { status: 500 }
    );
  }
}
