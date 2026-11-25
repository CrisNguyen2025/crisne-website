import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const writeAccessMock = vi.hoisted(() => ({
  requireWriteAccess: vi.fn().mockResolvedValue(null),
}));

const r2Mock = vi.hoisted(() => ({
  uploadToStorage: vi.fn(),
  generateFilename: vi.fn(),
}));

vi.mock("@/lib/auth/write-access", () => writeAccessMock);
vi.mock("@/lib/r2-client", () => r2Mock);

import { POST } from "@/app/api/upload-image/route";

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

function uploadRequest(formData: FormData) {
  return new NextRequest("http://localhost/api/upload-image", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/upload-image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAccessMock.requireWriteAccess.mockResolvedValue(null);
    r2Mock.generateFilename.mockReturnValue("sample-123.png");
    r2Mock.uploadToStorage.mockResolvedValue("https://cdn.example.com/uploads/sample-123.png");
  });

  it("returns 401 when write access is denied", async () => {
    writeAccessMock.requireWriteAccess.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));
    const fd = new FormData();
    fd.append("file", new File([PNG_BYTES], "test.png", { type: "image/png" }));
    const res = await POST(uploadRequest(fd));
    expect(res.status).toBe(401);
    expect(r2Mock.uploadToStorage).not.toHaveBeenCalled();
  });

  it("rejects missing or non-file field with 400", async () => {
    const emptyFd = new FormData();
    expect((await POST(uploadRequest(emptyFd))).status).toBe(400);

    const textFd = new FormData();
    textFd.append("file", "not-a-file");
    expect((await POST(uploadRequest(textFd))).status).toBe(400);
  });

  it("rejects invalid mime type and corrupted magic bytes with 400", async () => {
    const badMimeFd = new FormData();
    badMimeFd.append("file", new File([PNG_BYTES], "doc.pdf", { type: "application/pdf" }));
    expect((await POST(uploadRequest(badMimeFd))).status).toBe(400);

    const spoofedPngFd = new FormData();
    spoofedPngFd.append("file", new File(["not really a png image"], "fake.png", { type: "image/png" }));
    expect((await POST(uploadRequest(spoofedPngFd))).status).toBe(400);
    expect(r2Mock.uploadToStorage).not.toHaveBeenCalled();
  });

  it("uploads valid PNG and returns URL metadata", async () => {
    const fd = new FormData();
    fd.append("file", new File([PNG_BYTES], "photo.png", { type: "image/png" }));
    const res = await POST(uploadRequest(fd));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://cdn.example.com/uploads/sample-123.png",
      size: PNG_BYTES.length,
      type: "image/png",
      filename: "sample-123.png",
    });
    expect(r2Mock.uploadToStorage).toHaveBeenCalledOnce();
  });
});
