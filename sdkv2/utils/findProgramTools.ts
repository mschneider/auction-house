import { PublicKey } from "@solana/web3.js";

type GetAuctionAddressesParams = Parameters<
  (
    auctionId: Buffer | number[] | Uint8Array,
    walletPk: PublicKey,
    programPk: PublicKey
  ) => void
>;

export const getAuctionPk = async (...args: GetAuctionAddressesParams) => {
  const auction = await findProgramAddressBase(
    "auction",
    args[0],
    args[1],
    args[2]
  );
  return auction;
};

export const getQuoteVaultPk = async (...args: GetAuctionAddressesParams) => {
  const quoteVault = await findProgramAddressBase(
    "quote_vault",
    args[0],
    args[1],
    args[2]
  );
  return quoteVault;
};

export const getBaseVaultPk = async (...args: GetAuctionAddressesParams) => {
  const baseVault = await findProgramAddressBase(
    "base_vault",
    args[0],
    args[1],
    args[2]
  );
  return baseVault;
};

export const getAuctionAddresses = async (
  ...args: GetAuctionAddressesParams
) => {
  const [auctionPk, quoteVault, baseVault] = await Promise.all([
    getAuctionPk(args[0], args[1], args[2]),
    getQuoteVaultPk(args[0], args[1], args[2]),
    getBaseVaultPk(args[0], args[1], args[2]),
  ]);
  return {
    auctionPk,
    quoteVault,
    baseVault,
  };
};

export const findProgramAddressBase = async (
  bufferName: string,
  param1: Buffer | number[] | Uint8Array,
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
