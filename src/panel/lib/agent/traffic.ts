/** 每个节点已处理的最大 seq（进程内 Map，单实例足够；多副本再换 PG/Redis） */
const maxSeqByNode = new Map<string, number>()

export function getMaxSeq(nodeId: string) {
  return maxSeqByNode.get(nodeId) ?? 0
}

export function rememberSeq(nodeId: string, seq: number) {
  maxSeqByNode.set(nodeId, seq)
}

export function resetTrafficSeqStore() {
  maxSeqByNode.clear()
}
