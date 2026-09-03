// Minimal typing for busboy 1.x (no @types package in the workspace).
declare module 'busboy' {
  import type { Readable, Writable } from 'node:stream';
  import type { IncomingHttpHeaders } from 'node:http';

  interface BusboyLimits {
    fileSize?: number;
    files?: number;
    fields?: number;
    fieldSize?: number;
  }
  interface BusboyConfig {
    headers: IncomingHttpHeaders;
    limits?: BusboyLimits;
  }
  interface FileInfo {
    filename: string;
    encoding: string;
    mimeType: string;
  }
  interface FileStream extends Readable {
    truncated: boolean;
  }
  interface Busboy extends Writable {
    on(event: 'file', listener: (name: string, stream: FileStream, info: FileInfo) => void): this;
    on(event: 'field', listener: (name: string, value: string) => void): this;
    on(event: 'finish' | 'close', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }
  function busboy(config: BusboyConfig): Busboy;
  export = busboy;
}
