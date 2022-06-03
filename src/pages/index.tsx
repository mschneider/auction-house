import { BN, getProvider } from "@project-serum/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import useAuctionStore, { fetchAuctions } from "../stores/AuctionStore";
import * as nacl from "tweetnacl";
import { Auction as GenAuction } from "../../generated/accounts";
import Modal from "../components/Modal";
import useLocalStorageState, {
  handleParseKeyPairArray,
} from "../hooks/useLocalStorageState";
import * as dayjs from "dayjs";
import Button from "../components/Button";
import Input, { Label } from "../components/Input";
import { createAuctionInstructions } from "../../sdkv2/auction";

interface AuctionForm {
  baseMint: string;
  quoteMint: string;
  areAsksEncrypted: boolean;
  areBidsEncrypted: boolean;
  minBaseOrderSize: number;
  tickSize: number;
  orderPhaseLength: number;
  decryptionPhaseLength: number;
  eventQueueBytes: number;
  bidsBytes: number;
  asksBytes: number;
  maxOrders: number;
}

const AuctionItem = ({
  pk,
  auction,
  localAuctionKeys,
}: {
  pk: PublicKey;
  auction: GenAuction;
  localAuctionKeys: nacl.BoxKeyPair[];
}) => {
  const localAuctionKeyIndex = localAuctionKeys
    .map((a) => a.publicKey)
    .findIndex((a) => auction.naclPubkey.every((b, i) => b === a[i]));

  return (
    <>
      <tr key={pk.toString()}>
        <td>{auction.auctionId}</td>
        <td>
          {dayjs
            .unix(auction.startOrderPhase.toNumber())
            .toDate()
            .toLocaleString()}
        </td>
        <td>
          {dayjs
            .unix(auction.endOrderPhase.toNumber())
            .toDate()
            .toLocaleString()}
        </td>
        <td>
          {dayjs
            .unix(auction.endDecryptionPhase.toNumber())
            .toDate()
            .toLocaleString()}
        </td>
        <td>{auction.clearingPrice.toNumber()}</td>
        <td>{auction.totalQuantityMatched.toNumber()}</td>
        <td>{auction.remainingBidFills.toNumber()}</td>
        <td>{auction.remainingAskFills.toNumber()}</td>
        <td>
          <a href={`/auction/${pk.toBase58()}`}>user</a>
          {localAuctionKeyIndex > -1 && (
            <>
              <span> </span>
              <a href={`/admin/${pk.toBase58()}`}>admin</a>
            </>
          )}
        </td>
      </tr>
    </>
  );
};

const AuctionsList = () => {
  const { program, auctions, loadingAuctions } = useAuctionStore((s) => s);

  const [localAuctionKeys, setLocalAuctionKeys] = useLocalStorageState(
    "localAuctionKeys",
    [] as nacl.BoxKeyPair[],
    handleParseKeyPairArray
  );

  const [openCreateAuctionModal, setOpenCreateAuctionModal] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      baseMint: "GoES7CDvee2AiNWNBoGuuQnEwD8b1qyMXL77cxSDf3Vd",
      quoteMint: "ATDQACtXEBK6C5p8qc7bXBswi12FSBgbzTuLhR1fpeUC",
      areAsksEncrypted: false,
      areBidsEncrypted: true,
      minBaseOrderSize: 1000,
      tickSize: 0.1,
      orderPhaseLength: 86400, // 24h
      decryptionPhaseLength: 3600, // 1h
      eventQueueBytes: 1000000,
      bidsBytes: 64000,
      asksBytes: 64000,
      maxOrders: 2,
    },
  });

  useEffect(() => {
    fetchAuctions();
  }, []);
  const createAuction = async (data: AuctionForm) => {
    console.log(data);
    const provider = getProvider();
    let tx = new Transaction();
    const auctionObj = await createAuctionInstructions({
      ...data,
      connection: provider.connection,
      wallet: provider.wallet.publicKey,
      programId: program.programId,
      baseMint: new PublicKey(data.baseMint),
      quoteMint: new PublicKey(data.quoteMint),
    });
    tx.add(...auctionObj.transactionInstructions);
    setLocalAuctionKeys(localAuctionKeys.concat([auctionObj.localAuctionKey]));
    console.log(tx);
    await provider.send(tx, [...auctionObj.signers], { skipPreflight: true });
    let thisAuction = await program.account.auction.fetch(
      auctionObj.auction.auction
    );

    fetchAuctions();
    console.log(thisAuction);
  };

  return (
    <div>
      <div className="flex space-x-2">
        <h1 className="p-1">Auctions</h1>
        <div className=" p-1">
          {loadingAuctions ? (
            "xxxxx"
          ) : (
            <Button onClick={fetchAuctions}>fetch</Button>
          )}
        </div>
        <div className=" p-1">
          <Button onClick={() => setOpenCreateAuctionModal(true)}>
            create
          </Button>
        </div>
      </div>
      <table className="table-auto text-th-fgd-3 w-full">
        <thead>
          <tr>
            <th>PK</th>
            <th>Start</th>
            <th>End</th>
            <th>Settlement</th>
            <th>ClearingPrice</th>
            <th>TotalMatched</th>
            <th>RemainingBids</th>
            <th>RemainingAsks</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {auctions.map((a) => (
            <AuctionItem
              key={a.publicKey}
              pk={a.publicKey}
              auction={new GenAuction(a.account)}
              localAuctionKeys={localAuctionKeys}
            />
          ))}
        </tbody>
      </table>
      {openCreateAuctionModal && (
        <Modal
          onClose={() => {
            setOpenCreateAuctionModal(false);
          }}
          isOpen={openCreateAuctionModal}
        >
          <div className="">
            <h2 className="text-xl">Create Auction</h2>
            <form
              onSubmit={handleSubmit(createAuction)}
              className="space-y-2 my-2"
            >
              <div>
                <Label>Base Mint:</Label>
                <Input {...register("baseMint")} />
              </div>

              <div>
                <Label>Quote Mint:</Label>
                <Input {...register("quoteMint")} />
              </div>

              <div>
                <Label>Encrypt Asks</Label>
                <input
                  type="checkbox"
                  {...register("areAsksEncrypted")}
                ></input>
              </div>

              <div>
                <Label>Encrypt Bids</Label>
                <input
                  type="checkbox"
                  {...register("areBidsEncrypted")}
                ></input>
              </div>

              <div>
                <Label>Min Base Order Size:</Label>
                <Input {...register("minBaseOrderSize")} />
              </div>

              <div>
                <Label>Tick Size:</Label>
                <Input {...register("tickSize")} />
              </div>

              <div>
                <Label>Order Phase Duration (s):</Label>
                <Input {...register("orderPhaseLength")} />
              </div>

              <div>
                <Label>Decryption Phase Duration (s):</Label>
                <Input {...register("decryptionPhaseLength")} />
              </div>

              <div>
                <Label>Event Queue Bytes:</Label>
                <Input {...register("eventQueueBytes")} />
              </div>
              <div>
                <Label>Bids Bytes:</Label>
                <Input {...register("bidsBytes")} />
              </div>
              <div>
                <Label>Asks Bytes:</Label>
                <Input {...register("asksBytes")} />
              </div>
              <div>
                <Label>Max Orders (per User):</Label>
                <Input {...register("maxOrders")} />
              </div>
              <div className="flex pt-2">
                <Button className="ml-auto" type="submit">
                  Create
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AuctionsList;
