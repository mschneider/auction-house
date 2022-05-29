import { PublicKey } from "@solana/web3.js";

export const getAuctionPk = async (
  auctionId: Buffer,
  walletPk: PublicKey,
  programPk: PublicKey
) => {
  const auction = await findProgramAddressBase(
    "auction",
    auctionId,
    walletPk,
    programPk
  );
  return auction;
};

export const getQuoteVaultPk = async (
  auctionId: Buffer,
  walletPk: PublicKey,
  programPk: PublicKey
) => {
  const quoteVault = await findProgramAddressBase(
    "quote_vault",
    auctionId,
    walletPk,
    programPk
  );
  return quoteVault;
};

export const getBaseVaultPk = async (
  auctionId: Buffer,
  walletPk: PublicKey,
  programPk: PublicKey
) => {
  const baseVault = await findProgramAddressBase(
    "base_vault",
    auctionId,
    walletPk,
    programPk
  );
  return baseVault;
};

export const findProgramAddressBase = async (
  bufferName: string,
  param1: Buffer,
  param2: PublicKey,
  programPk: PublicKey
) => {
  let [pk] = await PublicKey.findProgramAddress(
    // TODO toBuffer might not be LE (lower endian) by default
    [Buffer.from(bufferName), Buffer.from(param1), param2.toBuffer()],
    programPk
  );
  return pk;
};
