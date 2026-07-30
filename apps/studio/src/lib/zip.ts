/**
 * Minimal store-only ZIP writer. PNG frames are already compressed, so there is
 * nothing to gain from deflate — this keeps the export dependency-free.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface Entry {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
}

/** Uint8Array is a perfectly good BlobPart; the DOM types just disagree. */
const part = (u: Uint8Array): BlobPart => u as unknown as BlobPart;

export class ZipWriter {
  private parts: BlobPart[] = [];
  private entries: Entry[] = [];
  private offset = 0;

  async add(name: string, data: Blob) {
    const bytes = new Uint8Array(await data.arrayBuffer());
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(bytes);

    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true); // version needed
    header.setUint16(6, 0, true); // flags
    header.setUint16(8, 0, true); // stored
    header.setUint16(10, 0, true); // time
    header.setUint16(12, 0, true); // date
    header.setUint32(14, crc, true);
    header.setUint32(18, bytes.length, true);
    header.setUint32(22, bytes.length, true);
    header.setUint16(26, nameBytes.length, true);
    header.setUint16(28, 0, true);

    this.entries.push({ name: nameBytes, crc, size: bytes.length, offset: this.offset });
    this.parts.push(header.buffer, part(nameBytes), part(bytes));
    this.offset += 30 + nameBytes.length + bytes.length;
  }

  finish(): Blob {
    const central: BlobPart[] = [];
    let centralSize = 0;

    for (const e of this.entries) {
      const dv = new DataView(new ArrayBuffer(46));
      dv.setUint32(0, 0x02014b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 20, true);
      dv.setUint16(8, 0, true);
      dv.setUint16(10, 0, true);
      dv.setUint16(12, 0, true);
      dv.setUint16(14, 0, true);
      dv.setUint32(16, e.crc, true);
      dv.setUint32(20, e.size, true);
      dv.setUint32(24, e.size, true);
      dv.setUint16(28, e.name.length, true);
      dv.setUint16(30, 0, true);
      dv.setUint16(32, 0, true);
      dv.setUint16(34, 0, true);
      dv.setUint16(36, 0, true);
      dv.setUint32(38, 0, true);
      dv.setUint32(42, e.offset, true);
      central.push(dv.buffer, part(e.name));
      centralSize += 46 + e.name.length;
    }

    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, this.entries.length, true);
    end.setUint16(10, this.entries.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, this.offset, true);

    return new Blob([...this.parts, ...central, end.buffer], { type: 'application/zip' });
  }
}
