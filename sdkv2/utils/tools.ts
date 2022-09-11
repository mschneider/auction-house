import { BN } from "@project-serum/anchor";
import { Connection, CreateAccountParams, PublicKey } from "@solana/web3.js";

export function toFp32(num: number): BN {
  return new BN(Math.floor(num * 2 ** 32));
}

export async function handleCreateAuctionParams({
  programId,
  connection,
  wallet,
  newPubkey,
  space,
}: {
  programId: PublicKey;
  connection: Connection;
  wallet: PublicKey;
  newPubkey: PublicKey;
  space: number;
}): Promise<CreateAccountParams> {
  const rentExemptionAmount =
    await connection.getMinimumBalanceForRentExemption(space);
  return {
    fromPubkey: wallet,
    newAccountPubkey: newPubkey,
    lamports: rentExemptionAmount,
    space,
    programId,
  };
}
