import { BrowserProvider, Contract } from "ethers";
import abi from "./contract-abi.json";
import addressConfig from "./contract-address.json";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export async function connectWallet() {
  if (!window.ethereum) throw new Error("MetaMask is not installed. Install MetaMask and try again.");
  const provider = new BrowserProvider(window.ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);
  if (!accounts.length) throw new Error("No wallet account was selected.");
  const signer = await provider.getSigner();
  return { provider, signer, address: accounts[0] };
}
export async function getContract(signerOrProvider) {
  if (!addressConfig.address) throw new Error("Contract not deployed. Follow the README deployment steps first.");
  return new Contract(addressConfig.address, abi, signerOrProvider);
}
export function shortAddress(address = "") {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Not connected";
}

export function errorMessage(error) {
  const data =
    error?.data ||
    error?.info?.error?.data ||
    error?.info?.error?.data?.data;

  const reason =
    error?.reason ||
    error?.revert?.name ||
    error?.info?.error?.message ||
    error?.shortMessage ||
    error?.message ||
    "Transaction failed";

  if (/user rejected|user denied/i.test(reason)) {
    return "Transaction was rejected in MetaMask.";
  }

  if (/NotApproved/i.test(reason)) {
    return "Student approval is required before enrollment.";
  }

  if (/AlreadyDone/i.test(reason)) {
    return "This action has already been completed.";
  }

  if (/SessionUnavailable/i.test(reason)) {
    return "The attendance session is closed, expired, or you are not enrolled.";
  }

  if (/Unauthorized/i.test(reason)) {
    return "This wallet does not have permission to perform this action.";
  }

  if (/NotFound/i.test(reason)) {
    return "Course or session not found. Check the QR code and contract deployment.";
  }

  if (/InvalidInput/i.test(reason)) {
    return "The contract rejected the input. Check the course ID and other values.";
  }

  if (/missing revert data|CALL_EXCEPTION/i.test(reason)) {
    return "Contract call failed. Check the deployed contract address, ABI, and transaction details.";
  }

  return reason.replace(/^execution reverted:\s*/i, "");
}
