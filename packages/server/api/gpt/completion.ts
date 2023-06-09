import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { ethers } from 'ethers';

type FunctionDetails = {
  functionName: string;
  functionArgs: Array<any>;
  functionAbi: object;
}
type ABI = Array<{
  type?: string;
  name?: string;
  inputs?: Array<unknown>;
  outputs?: Array<unknown>;
  stateMutability?: string;
  anonymous?: boolean;
  constant?: boolean;
}>;
 
export default async function (
  request: VercelRequest,
  response: VercelResponse
) {
  const responseData = await getResponseData(request);
  response.status(200).json({ 'data': responseData });
}

/**
 * Get API Response
 */
const getResponseData = async (
  request: VercelRequest
) => {
  const { contractAddress, inputData, chainId } = request.query;
  const strContractAddress = contractAddress as string;
  const strInputData = inputData as string;
  const chainIdNumber = Number(chainId);

  try {
    let ResponseData = '';

    const contractDetails = await getContractDetails(chainIdNumber, strContractAddress);
    if (!contractDetails) {
      ResponseData += '【WARNING】 The safety of the function you are trying to execute cannot be confirmed because it has not verified.';
      return ResponseData;
    }

    const contractFunctionDetails = await getContractFunctionDetails(strInputData, contractDetails.abi);
    const functionSourceCode = getFunctionSourceCode(contractDetails.contractCode, contractFunctionDetails.functionName);
    ResponseData += await getGptCompletion(strContractAddress, contractDetails.contractName, functionSourceCode, contractFunctionDetails);

    return ResponseData;
  } catch (error) {
    console.error(error);
    return { error: 'An Error Occurred'};
  }
}

/**
 * Get Construct Details
 */
const getContractDetails = async (
  chainId: number,
  contractAddress: string
) => {
  const apiUri = getContractDetailsApiEndpoint(chainId, contractAddress);
  if (!apiUri) {
    return false;
  }

  const response = await axios.get(apiUri);
  const result = response.data.result;
  if (!(result && result[0])) {
    return false;
  }

  const contractName = result[0].ContractName;
  const contractCode = result[0].SourceCode;
  const abi = result[0].ABI;
  if (!contractName || !contractCode || !abi) {
    return false;
  }

  return {
    contractName: contractName,
    contractCode: contractCode,
    abi: abi
  };
}

/**
 * Get the API Endpoint for obtaining detailed information on the construct
 */
const getContractDetailsApiEndpoint = (
  chainId: number,
  contractAddress: string
) => {
  switch (chainId) {
    case 1: { // Eth Mainnet
      let apiKey = process.env.ETHERSCAN_API_KEY as string;
      return `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${apiKey}`;
    }
    case 5: { // Goerli Testnet
      let apiKey = process.env.ETHERSCAN_API_KEY as string;
      return `https://api-goerli.etherscan.io/api?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${apiKey}`;
    }
    case 137: { // Polygon Mainnet
      let apiKey = process.env.POLYGONSCAN_API_KEY as string;
      return `https://api.polygonscan.com/api?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${apiKey}`;
    }
    case 59140: { // Linea Testnet
      return `https://explorer.goerli.linea.build/api?module=contract&action=getsourcecode&address=${contractAddress}`;
    }
    case 80001: { // Mumbai Testnet
      let apiKey = process.env.POLYGONSCAN_API_KEY as string;
      return `https://api-testnet.polygonscan.com/api?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${apiKey}`;
    }
    default: {
      console.log('ChainId not supported.')
      return false;
    }
  }
}

/**
 * Get the function name, arguments, and ABI of the function
 * to be executed based on the contract function signature
 */
const getContractFunctionDetails = (
  inputData: string,
  contractABI: string
): FunctionDetails => {
  const contractInterface = new ethers.Interface(contractABI);
  const decodedFunctionData = contractInterface.parseTransaction({ data: inputData });
  if (!decodedFunctionData) {
    return {
      functionName: '',
      functionArgs: [],
      functionAbi: {},
    }
  }
  const functionName = (decodedFunctionData as ethers.TransactionDescription).name;
  const functionArgs = (decodedFunctionData as ethers.TransactionDescription).args;

  // Get the ABI of the executed function
  const arrContractABI = JSON.parse(contractABI) as ABI;
  let functionAbi = arrContractABI.find((item) => item.type === "function" && item.name === functionName);
  if (!functionAbi) {
    console.log(`Function '${functionAbi}' not found in ABI.`)
    functionAbi = {};
  }

  return {
    functionName: functionName,
    functionArgs: functionArgs,
    functionAbi: functionAbi,
  }
}

/**
 * Extract function source code from contract code
 */
const getFunctionSourceCode = (
  contractCode: string,
  functionName: string
) => {
  const delimiter = "function";
  const stringArray = contractCode.split(delimiter);

  let functionSourceCode = ''
  stringArray.forEach((item, index) => {
    const pattern: RegExp = new RegExp(`(${functionName}.*{)`);
    if (pattern.test(item)) {
      functionSourceCode += item;
    }
  });

  if (functionSourceCode === '') {
    console.log(`Function '${functionName}' not found in contract code.`)
  }
  return functionSourceCode;
}

/**
 * Based on contract information, GPT infers function execution details
 */
const getGptCompletion = async (
  contractAddress: string,
  contractName: string,
  functionSourceCode: string,
  contractFunctionDetails: FunctionDetails
) => {
  const apiKey = process.env.GPT_API_KEY as string;
  const apiEndpoint = process.env.GPT_API_ENDPOINT as string;
  const apiUri = `${apiEndpoint}/v1/chat/completions`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };
  const functionAbiString = JSON.stringify(contractFunctionDetails.functionAbi);
  const content = `・ContractAddress: ${contractAddress}\n・ContractName: ${contractName}\n・FunctionName: ${contractFunctionDetails.functionName}\n・FunctionArgs: ${contractFunctionDetails.functionArgs}\n・FunctionABI: ${functionAbiString}\n・FunctionSourceCode: ${functionSourceCode}\nPlease tell me what the above smart contract executes.`;
  const data = {
    'model': 'gpt-3.5-turbo',
    'messages': [{
      'role': 'user',
      'content': content
    }]
  };

  const response = await axios.post(apiUri, data, { headers: headers });
  if (response.status !== 200) {
    throw new Error('Failed to get GPT completion.');
  }

  const result = response.data.choices[0].message.content;
  return result;
}
