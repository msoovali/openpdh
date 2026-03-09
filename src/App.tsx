import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { useState } from 'react';
import { Layout } from './components/Layout';
import { ConfigureFlow } from './components/ConfigureFlow';
import { ReadFlow } from './components/ReadFlow';
import { ConfigList } from './components/ConfigList';

type View = 'configure' | 'read' | 'configs';

export default function App() {
  const [view, setView] = useState<View>('read');
  const [editConfigId, setEditConfigId] = useState<string | null>(null);

  const handleEdit = (id: string) => {
    setEditConfigId(id);
    setView('configure');
  };

  const handleNewConfig = () => {
    setEditConfigId(null);
    setView('configure');
  };

  return (
    <MantineProvider>
      <Layout onNavigate={setView} currentView={view}>
        {view === 'configure' && (
          <ConfigureFlow
            editConfigId={editConfigId}
            onDone={() => { setEditConfigId(null); setView('configs'); }}
          />
        )}
        {view === 'read' && <ReadFlow />}
        {view === 'configs' && <ConfigList onEdit={handleEdit} onNew={handleNewConfig} />}
      </Layout>
    </MantineProvider>
  );
}
