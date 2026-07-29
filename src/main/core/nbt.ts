import { gunzipSync, inflateSync } from 'node:zlib'

/**
 * Minimal big-endian NBT reader — enough to pull metadata out of `level.dat`.
 * Longs are returned as `bigint` so world seeds survive intact.
 */

export type NbtValue =
  | number
  | bigint
  | string
  | Buffer
  | NbtValue[]
  | { [key: string]: NbtValue }

const TAG_END = 0
const TAG_BYTE = 1
const TAG_SHORT = 2
const TAG_INT = 3
const TAG_LONG = 4
const TAG_FLOAT = 5
const TAG_DOUBLE = 6
const TAG_BYTE_ARRAY = 7
const TAG_STRING = 8
const TAG_LIST = 9
const TAG_COMPOUND = 10
const TAG_INT_ARRAY = 11
const TAG_LONG_ARRAY = 12

class Reader {
  private offset = 0

  constructor(private readonly buffer: Buffer) {}

  get remaining(): number {
    return this.buffer.length - this.offset
  }

  u1(): number {
    return this.buffer.readUInt8(this.offset++)
  }
  i1(): number {
    return this.buffer.readInt8(this.offset++)
  }
  i2(): number {
    const value = this.buffer.readInt16BE(this.offset)
    this.offset += 2
    return value
  }
  u2(): number {
    const value = this.buffer.readUInt16BE(this.offset)
    this.offset += 2
    return value
  }
  i4(): number {
    const value = this.buffer.readInt32BE(this.offset)
    this.offset += 4
    return value
  }
  i8(): bigint {
    const value = this.buffer.readBigInt64BE(this.offset)
    this.offset += 8
    return value
  }
  f4(): number {
    const value = this.buffer.readFloatBE(this.offset)
    this.offset += 4
    return value
  }
  f8(): number {
    const value = this.buffer.readDoubleBE(this.offset)
    this.offset += 8
    return value
  }
  bytes(length: number): Buffer {
    const slice = this.buffer.subarray(this.offset, this.offset + length)
    this.offset += length
    return slice
  }
  string(): string {
    return this.bytes(this.u2()).toString('utf8')
  }
}

function readPayload(reader: Reader, type: number, depth: number): NbtValue {
  if (depth > 64) throw new Error('NBT nesting too deep')

  switch (type) {
    case TAG_BYTE:
      return reader.i1()
    case TAG_SHORT:
      return reader.i2()
    case TAG_INT:
      return reader.i4()
    case TAG_LONG:
      return reader.i8()
    case TAG_FLOAT:
      return reader.f4()
    case TAG_DOUBLE:
      return reader.f8()
    case TAG_BYTE_ARRAY:
      return reader.bytes(reader.i4())
    case TAG_STRING:
      return reader.string()
    case TAG_LIST: {
      const itemType = reader.u1()
      const length = reader.i4()
      const items: NbtValue[] = []
      for (let i = 0; i < length; i++) {
        if (itemType === TAG_END) break
        items.push(readPayload(reader, itemType, depth + 1))
      }
      return items
    }
    case TAG_COMPOUND: {
      const compound: Record<string, NbtValue> = {}
      while (reader.remaining > 0) {
        const childType = reader.u1()
        if (childType === TAG_END) break
        const name = reader.string()
        compound[name] = readPayload(reader, childType, depth + 1)
      }
      return compound
    }
    case TAG_INT_ARRAY: {
      const length = reader.i4()
      const values: number[] = []
      for (let i = 0; i < length; i++) values.push(reader.i4())
      return values
    }
    case TAG_LONG_ARRAY: {
      const length = reader.i4()
      const values: bigint[] = []
      for (let i = 0; i < length; i++) values.push(reader.i8())
      return values as unknown as NbtValue
    }
    default:
      throw new Error(`Unsupported NBT tag type ${type}`)
  }
}

function decompress(buffer: Buffer): Buffer {
  // gzip
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) return gunzipSync(buffer)
  // raw zlib
  if (buffer[0] === 0x78) return inflateSync(buffer)
  return buffer
}

export function parseNbt(raw: Buffer): Record<string, NbtValue> | null {
  try {
    const buffer = decompress(raw)
    const reader = new Reader(buffer)
    const type = reader.u1()
    if (type !== TAG_COMPOUND) return null
    reader.string() // root name, conventionally empty
    return readPayload(reader, TAG_COMPOUND, 0) as Record<string, NbtValue>
  } catch {
    return null
  }
}

/** Safe dotted-path lookup: `get(root, 'Data', 'Version', 'Name')`. */
export function nbtGet(root: NbtValue | null | undefined, ...path: string[]): NbtValue | undefined {
  let current: NbtValue | null | undefined = root
  for (const key of path) {
    if (current === undefined || current === null || typeof current !== 'object' || Array.isArray(current)) {
      return undefined
    }
    current = (current as Record<string, NbtValue>)[key]
  }
  return current ?? undefined
}

export function nbtString(value: NbtValue | undefined): string | null {
  return typeof value === 'string' ? value : null
}

export function nbtNumber(value: NbtValue | undefined): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  return null
}
