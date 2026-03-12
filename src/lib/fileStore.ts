import { createContext, useContext } from 'react';

export interface FileStore {
  files: File[];
  setFiles: (files: File[]) => void;
}

export const FileStoreContext = createContext<FileStore>({
  files: [],
  setFiles: () => {},
});

export function useFiles() {
  return useContext(FileStoreContext);
}

export function fileKey(f: File): string {
  return f.name + f.size;
}
