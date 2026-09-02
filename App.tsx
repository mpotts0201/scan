import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { initDatabase } from './src/db';

export default function App() {
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    initDatabase().catch((error: unknown) => {
      setDbError(error instanceof Error ? error.message : String(error));
    });
  }, []);

  return (
    <View style={styles.container}>
      <Text>
        {dbError === null
          ? 'Open up App.tsx to start working on your app!'
          : `Database failed to open: ${dbError}`}
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
