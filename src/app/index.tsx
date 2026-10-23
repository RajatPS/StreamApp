import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import ConnectionSheet from '../components/connection-sheet';
import Navbar from '../components/navbar';
import RenameConnection from '../components/rename-connection';
import Sidebar from '../components/sidebar';
import { createRoom, endRoom, joinRoom } from '../utils/room-client';
import {
  getSavedConnections,
  renameSavedConnection,
  saveConnection,
  type ConnectionValues,
  type SavedConnection,
} from '../utils/connection-storage';

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [connectionSheetOpen, setConnectionSheetOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<'default' | 'join'>('default');
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
  const [openConnectionMenuId, setOpenConnectionMenuId] = useState<number | null>(null);
  const [storageError, setStorageError] = useState('');
  const [connectionToRename, setConnectionToRename] = useState<SavedConnection | null>(null);

  useEffect(() => {
    let active = true;

    getSavedConnections()
      .then((connections) => {
        if (active) {
          setSavedConnections(connections);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setStorageError(
            error instanceof Error
              ? `Could not load saved connections: ${error.message}`
              : 'Could not load saved connections.',
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSaveConnection = async (values: ConnectionValues) => {
    const hasConnectionDetails = Object.values(values).some((value) =>
      value.trim(),
    );
    let valuesToSave = values;
    let createdRoom: Awaited<ReturnType<typeof createRoom>> | null = null;

    if (!hasConnectionDetails) {
      const existingConnections = await getSavedConnections();
      const existingNames = new Set(
        existingConnections.map((connection) => connection.name),
      );
      let previewNumber = 1;
      while (existingNames.has(`Local Preview ${previewNumber}`)) {
        previewNumber += 1;
      }

      valuesToSave = {
        ...values,
        'Connection Name': `Local Preview ${previewNumber}`,
      };
    } else {
      createdRoom = await createRoom(values);
      valuesToSave = {
        ...values,
        'Room ID': createdRoom.id,
        __backendUrl: createdRoom.backendUrl,
        __hostToken: createdRoom.hostToken,
      };
    }

    let savedConnection: SavedConnection;
    try {
      savedConnection = await saveConnection(valuesToSave);
    } catch (error) {
      if (createdRoom) {
        try {
          await endRoom(
            createdRoom.id,
            createdRoom.hostToken,
            createdRoom.backendUrl,
          );
        } catch (cleanupError) {
          const cleanupMessage =
            cleanupError instanceof Error
              ? cleanupError.message
              : 'The temporary backend room could not be removed.';
          throw new Error(
            `Could not save the connection locally, and backend cleanup failed: ${cleanupMessage}`,
          );
        }
      }
      throw error;
    }
    setSavedConnections((connections) => [...connections, savedConnection]);
    setStorageError('');
    return savedConnection;
  };

  const openConnectionSheet = (mode: 'default' | 'join') => {
    setSidebarMode(mode);
    setConnectionSheetOpen(true);
  };

  const handleRename = (connection: SavedConnection) => {
    setConnectionToRename(connection);
    setOpenConnectionMenuId(null);
  };

  const handleRenameCancel = () => {
    setConnectionToRename(null);
    setOpenConnectionMenuId(null);
  };

  const handleRenameSubmit = async (newName: string) => {
    if (!connectionToRename) {
      throw new Error('No connection selected for rename.');
    }

    const renamedConnection = await renameSavedConnection(
      connectionToRename.id,
      newName,
    );

    setSavedConnections((connections) =>
      connections.map((connection) =>
        connection.id === renamedConnection.id
          ? { ...connection, name: renamedConnection.name }
          : connection,
      ),
    );

    setConnectionToRename(null);
    setOpenConnectionMenuId(null);
  };

  const handleEdit = (connection: SavedConnection) => {
    console.log('Edit connection', connection.id);
    setOpenConnectionMenuId(null);
  };

  const handleDelete = (connection: SavedConnection) => {
    console.log('Delete connection', connection.id);
    setOpenConnectionMenuId(null);
  };

  if (connectionToRename) {
    return (
      <RenameConnection
        currentName={connectionToRename.name}
        onCancel={handleRenameCancel}
        onSave={handleRenameSubmit}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Navbar */}
      <Navbar onMenuPress={() => setSidebarOpen(!sidebarOpen)} />

      {/* Sidebar */}
      {sidebarOpen && <Sidebar />}

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.connectionTiles}>
          <Pressable
            accessibilityRole="button"
            onPress={() => openConnectionSheet('default')}
            style={styles.connectionBox}
          >
            <Text style={styles.plus}>+</Text>
            <Text style={styles.connectionText}>Create a Connection</Text>
          </Pressable>

          <Pressable
            accessibilityLabel="Join a Connection"
            accessibilityRole="button"
            accessible
            onPress={() => openConnectionSheet('join')}
            style={styles.connectionBox}
          >
            <View style={styles.playIcon}>
              <Text style={styles.play}>▶</Text>
            </View>
            <Text style={styles.connectionText}>Join a Connection</Text>
          </Pressable>
        </View>

        {savedConnections.length > 0 ? (
          <View style={styles.savedConnections}>
            <Text style={styles.savedConnectionsTitle}>Saved connections</Text>
            {savedConnections.map((connection) => (
              <View key={connection.id} style={styles.savedConnectionContainer}>
                <View style={styles.savedConnection}>
                  <Pressable
                    accessibilityHint="Opens the camera preview and recording screen"
                    accessibilityLabel={`Open ${connection.name}`}
                    accessibilityRole="button"
                    onPress={() => {
                      setOpenConnectionMenuId(null);
                      router.push({
                        pathname: '/camera-preview',
                        params: {
                          connectionId: String(connection.id),
                          connectionName: connection.name,
                        },
                      });
                    }}
                    style={styles.savedConnectionOpen}
                  >
                    <Text style={styles.savedConnectionText}>
                      {connection.name}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Actions for ${connection.name}`}
                    accessibilityRole="button"
                    onPress={() =>
                      setOpenConnectionMenuId((openId) =>
                        openId === connection.id ? null : connection.id,
                      )
                    }
                    style={styles.connectionMenuButton}
                  >
                    <Text style={styles.connectionMenuIcon}>⋮</Text>
                  </Pressable>
                </View>
                {openConnectionMenuId === connection.id ? (
                  <View style={styles.connectionMenu}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => handleRename(connection)}
                      style={styles.connectionMenuOption}
                    >
                      <Text style={styles.connectionMenuText}>Rename Connection</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => handleEdit(connection)}
                      style={styles.connectionMenuOption}
                    >
                      <Text style={styles.connectionMenuText}>Edit Connection</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => handleDelete(connection)}
                      style={styles.connectionMenuOption}
                    >
                      <Text style={styles.connectionMenuText}>Delete Connection</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {storageError ? (
          <Text style={styles.storageError} accessibilityRole="alert">
            {storageError}
          </Text>
        ) : null}
      </ScrollView>

      <ConnectionSheet
        visible={connectionSheetOpen}
        mode={sidebarMode}
        onClose={() => setConnectionSheetOpen(false)}
        onSave={handleSaveConnection}
        onJoin={async (values) => {
          const room = await joinRoom(
            values['Stream ID'] ?? '',
            values['Display Name'] ?? '',
          );
          router.push({
            pathname: '/video-player',
            params: {
              streamId: room.id,
              displayName: room.displayName ?? values['Display Name'] ?? '',
              backendUrl: room.backendUrl,
            },
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111111',
  },

  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 24,
  },

  connectionTiles: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    width: '100%',
    maxWidth: 440,
    gap: 12,
    paddingHorizontal: 20,
  },

  connectionBox: {
    flex: 1,
    minHeight: 160,
    backgroundColor: '#1c1c1c',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },

  plus: {
    color: 'white',
    fontSize: 42,
    lineHeight: 48,
  },

  playIcon: {
    width: 46,
    height: 46,
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
  },

  play: {
    color: '#ffffff',
    fontSize: 20,
    marginLeft: 3,
  },

  connectionText: {
    color: 'white',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 12,
  },
  savedConnections: {
    width: '100%',
    maxWidth: 350,
    marginTop: 28,
    paddingHorizontal: 24,
  },
  savedConnectionsTitle: {
    color: '#b4b4b4',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  savedConnectionContainer: {
    marginBottom: 8,
  },
  savedConnection: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#343434',
    backgroundColor: '#1c1c1c',
  },
  savedConnectionText: {
    color: '#ffffff',
    fontSize: 15,
  },
  savedConnectionOpen: {
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  connectionMenuButton: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectionMenuIcon: {
    color: '#d5d5d5',
    fontSize: 23,
    lineHeight: 26,
  },
  connectionMenu: {
    alignSelf: 'flex-end',
    minWidth: 190,
    marginTop: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#343434',
    backgroundColor: '#202020',
    overflow: 'hidden',
  },
  connectionMenuOption: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  connectionMenuText: {
    color: '#ffffff',
    fontSize: 14,
  },
  storageError: {
    maxWidth: 350,
    color: '#fca5a5',
    fontSize: 13,
    marginTop: 16,
    paddingHorizontal: 24,
  },
});
