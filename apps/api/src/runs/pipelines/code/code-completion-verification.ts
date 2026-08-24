// Builds deterministic business-assertion and trusted-chain evidence before a code run may complete.
import type { CodeRunSnapshot } from "@uml-platform/contracts";
import { buildCodeStageTrustedChain } from "../../traceability/trusted-chain-traceability.js";
import { buildCodeBusinessAssertionResults } from "./code-business-assertions.js";

export function verifyCodeCompletionEvidence(snapshot: CodeRunSnapshot) {
  const baseline = snapshot.requirementBaseline;
  if (!baseline) {
    return {
      skipped: true as const,
      passed: true,
      businessAssertionResults: null,
      trustedChain: null,
    };
  }

  const businessAssertionResults = buildCodeBusinessAssertionResults({
    runId: snapshot.runId,
    baseline,
    businessLogic: snapshot.businessLogic,
    files: snapshot.files,
  });
  const trustedChain = buildCodeStageTrustedChain({
    runId: snapshot.runId,
    baseline,
    files: snapshot.files,
    businessAssertionResults,
  });
  return {
    skipped: false as const,
    passed: businessAssertionResults.passed,
    businessAssertionResults,
    trustedChain,
  };
}
