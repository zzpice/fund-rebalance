import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

test("PWA PNG 图标尺寸、数据块与校验完整", async () => {
  for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
    const png = await readFile(new URL(`../../icons/${name}`, import.meta.url));
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), name);
    assert.equal(png.readUInt32BE(16), size, `${name} width`);
    assert.equal(png.readUInt32BE(20), size, `${name} height`);
    let offset = 8;
    let ended = false;
    while (offset < png.length) {
      assert.ok(offset + 12 <= png.length, `${name} truncated chunk`);
      const length = png.readUInt32BE(offset);
      const kind = png.toString("ascii", offset + 4, offset + 8);
      assert.ok(offset + 12 + length <= png.length, `${name} ${kind} length`);
      assert.equal(png.readUInt32BE(offset + 8 + length), crc32(png.subarray(offset + 4, offset + 8 + length)), `${name} ${kind} CRC`);
      offset += 12 + length;
      if (kind === "IEND") {
        ended = true;
        break;
      }
    }
    assert.ok(ended, `${name} missing IEND`);
    assert.equal(offset, png.length, `${name} trailing data`);
  }
});
