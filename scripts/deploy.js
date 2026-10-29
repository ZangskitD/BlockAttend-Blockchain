import hre from "hardhat";
import fs from "node:fs";

const { ethers, network } = hre;
const factory = await ethers.getContractFactory("BlockAttend");
const contract = await factory.deploy();
await contract.waitForDeployment();
const address = await contract.getAddress();
console.log(`BlockAttend deployed to: ${address}`);
console.log(`Network: ${network.name}`);
fs.mkdirSync("src", { recursive: true });
fs.writeFileSync("src/contract-address.json", JSON.stringify({ address }, null, 2));
const artifact = await hre.artifacts.readArtifact("BlockAttend");
fs.writeFileSync("src/contract-abi.json", JSON.stringify(artifact.abi, null, 2));
console.log("Wrote ABI and address to src/.");
