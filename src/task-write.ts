// Every task mutation must advance the server-read version. Rules reject older
// clients which do not participate, including full-document cache replays.
export function taskWriteVersion(data: { _writeVersion?: unknown }): number {
  const version = data._writeVersion ?? 0;
  if (!Number.isSafeInteger(version) || (version as number) < 0) throw Error('課題の保存版が不正です。上書きを停止しました。');
  return (version as number) + 1;
}

// Rules may reject the losing CAS before the SDK reports an aborted transaction.
// Re-read once: repository identity/revision/session checks still decide the result.
export async function retryTaskWrite<T>(write: () => Promise<T>): Promise<T> {
  try { return await write(); }
  catch (error) {
    if ((error as { code?: string }).code === 'permission-denied') return write();
    throw error;
  }
}
