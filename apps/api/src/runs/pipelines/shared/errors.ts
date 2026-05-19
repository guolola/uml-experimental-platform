// Normalizes unknown thrown values into stable pipeline diagnostic text.

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
