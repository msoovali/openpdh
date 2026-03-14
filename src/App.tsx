import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Layout } from './components/Layout';
import { ConfigureFlow } from './components/ConfigureFlow';
import { ReadFlow } from './components/ReadFlow';
import { ConfigList } from './components/ConfigList';
import { FileStoreContext } from './lib/fileStore';

export type View = 'configure' | 'read' | 'configs';

function getInitialView(): View {
  const state = window.history.state as { view?: View } | null;
  return state?.view ?? 'configs';
}

export default function App() {
  const [view, setView] = useState<View>(getInitialView);
  const [editConfigId, setEditConfigId] = useState<string | null>(null);
  const [cloneFromConfigId, setCloneFromConfigId] = useState<string | null>(null);
  const [readConfigId, setReadConfigId] = useState<string | null>(null);
  const [sharedFiles, setSharedFiles] = useState<File[]>([]);
  const [returnToRead, setReturnToRead] = useState(false);

  const fileStore = useMemo(() => ({
    files: sharedFiles,
    setFiles: setSharedFiles,
  }), [sharedFiles]);

  const navigate = useCallback((next: View) => {
    window.history.pushState({ view: next }, '');
    setView(next);
  }, []);

  useEffect(() => {
    window.history.replaceState({ view }, '');

    const onPopState = (e: PopStateEvent) => {
      const state = e.state as { view?: View } | null;
      setView(state?.view ?? 'configs');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEdit = (id: string) => {
    setEditConfigId(id);
    setCloneFromConfigId(null);
    setReturnToRead(false);
    setSharedFiles([]);
    navigate('configure');
  };

  const handleEditFromRead = (id: string) => {
    setEditConfigId(id);
    setCloneFromConfigId(null);
    setReturnToRead(true);
    navigate('configure');
  };

  const handleCloneEditFromRead = (id: string) => {
    setEditConfigId(null);
    setCloneFromConfigId(id);
    setReturnToRead(true);
    navigate('configure');
  };

  const handleNewConfig = () => {
    setEditConfigId(null);
    setCloneFromConfigId(null);
    setReturnToRead(false);
    setSharedFiles([]);
    navigate('configure');
  };

  const handleRead = (id: string) => {
    setReadConfigId(id);
    setSharedFiles([]);
    navigate('read');
  };

  const handleConfigDone = (savedConfigId?: string, backToRead?: boolean) => {
    if (backToRead) {
      if (savedConfigId) setReadConfigId(savedConfigId);
      setReturnToRead(false);
      navigate('read');
    } else {
      setEditConfigId(null);
      setCloneFromConfigId(null);
      setReturnToRead(false);
      setSharedFiles([]);
      navigate('configs');
    }
  };

  return (
    <MantineProvider defaultColorScheme="light">
      <FileStoreContext value={fileStore}>
        <Layout onNavigate={navigate}>
          {view === 'configure' && (
            <ConfigureFlow
              editConfigId={editConfigId}
              cloneFromConfigId={cloneFromConfigId}
              returnToRead={returnToRead}
              onDone={handleConfigDone}
            />
          )}
          {view === 'read' && <ReadFlow initialConfigId={readConfigId} onEditTemplate={handleEditFromRead} onCloneEditTemplate={handleCloneEditFromRead} />}
          {view === 'configs' && <ConfigList onEdit={handleEdit} onNew={handleNewConfig} onRead={handleRead} />}
        </Layout>
      </FileStoreContext>
    </MantineProvider>
  );
}
