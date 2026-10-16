// Consensus acceptance alone does not establish successful contract execution.
export function hasConsensusFailure(receipt) {
  const result = receipt?.result_name ?? receipt?.resultName;
  if (result !== undefined && result !== null) return String(result).toUpperCase() !== 'MAJORITY_AGREE';
  // Observed Studio result 7 can later have FINALIZED lifecycle status.
  return receipt?.result === 7;
}

export function assertExecutionSucceeded(receipt) {
  const status = String(receipt?.statusName || receipt?.status_name || receipt?.status || '').toUpperCase();
  if (!['ACCEPTED', 'FINALIZED', '5', '7'].includes(status)) {
    throw new Error(`Transaction has not succeeded (status ${status || 'unknown'}).`);
  }
  if (hasConsensusFailure(receipt)) {
    throw new Error(`Validator consensus did not accept this transaction (${receipt.result_name || receipt.resultName || receipt.result}).`);
  }
  const leaders = receipt.consensus_data?.leader_receipt;
  const entries = Array.isArray(leaders) ? leaders : leaders ? [leaders] : [];
  // Studio includes both the leader and its validator-path receipt in this
  // array. Check the latest leader, not the last array item by position.
  const identifiedLeaders = entries.filter(entry => entry?.mode === 'leader');
  const latest = identifiedLeaders.at(-1) ?? (entries.every(entry => !entry?.mode) ? entries.at(-1) : undefined);
  const execution = latest?.execution_result ?? (entries.length ? undefined : receipt.txExecutionResultName);
  const successful = latest ? execution === 'SUCCESS' : execution === 'FINISHED_WITH_RETURN';
  const vmError = latest?.genvm_result;
  const hasVmError = [latest?.error, vmError?.raw_error, vmError?.error_code, vmError?.error_description]
    .some(value => value !== undefined && value !== null && value !== '');
  const resultStatus = latest?.result?.status;
  if (!successful || hasVmError || (resultStatus !== undefined && resultStatus !== 'return')) {
    throw new Error(`Contract execution was not successful: ${execution || 'unavailable'}. Inspect the transaction before retrying.`);
  }
  return receipt;
}

export function terminalStatus(receipt) {
  return ['ACCEPTED','FINALIZED','UNDETERMINED','CANCELED','CANCELLED','LEADER_TIMEOUT','VALIDATORS_TIMEOUT','APPEAL_UNDETERMINED','5','6','7','8','12','13'].includes(String(receipt?.statusName || receipt?.status_name || receipt?.status).toUpperCase());
}
