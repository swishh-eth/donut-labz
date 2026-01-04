// app/api/webhooks/alchemy/route.ts
// Alchemy webhook handler for mining events - more reliable than client-side reporting
// UPDATED: Now verifies transaction success before recording

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';
import { keccak256, toBytes, decodeAbiParameters, parseAbiParameters, formatUnits } from 'viem';

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Contract addresses
const SPRINKLES_MINER_ADDRESS = '0x924b2d4a89b84a37510950031dcdb6552dc97bcc'.toLowerCase();
const DONUT_MULTICALL_ADDRESS = '0x3ec144554b484C6798A683E34c8e8E222293f323'.toLowerCase();

// Your provider address for DONUT mining verification
const YOUR_PROVIDER_ADDRESS = '0x30cb501B97c6b87B7b240755C730A9795dBB84f5'.toLowerCase();

// Function selectors
const SPRINKLES_MINE_SELECTOR = keccak256(toBytes('mine(address,address,uint256,uint256,uint256,string)')).slice(0, 10);
const DONUT_MINE_SELECTOR = keccak256(toBytes('mine(address,uint256,uint256,uint256,string)')).slice(0, 10);

// Transfer event topic for extracting amounts
const TRANSFER_EVENT_TOPIC = keccak256(toBytes('Transfer(address,address,uint256)')).toLowerCase();

// Fee splitter contract - receives 5% of mining fee
const FEE_SPLITTER_ADDRESS = '0xcB2604D87fe3e5b6fe33C5d5Ff05781602357D59'.toLowerCase();

// Alchemy webhook signing key - set this in your environment variables
const ALCHEMY_SIGNING_KEY = process.env.ALCHEMY_WEBHOOK_SIGNING_KEY || '';

// Alchemy RPC for fetching transaction details
const ALCHEMY_RPC = 'https://base-mainnet.g.alchemy.com/v2/5UJ97LqB44fVqtSiYSq-g';
const FALLBACK_RPC = 'https://mainnet.base.org';

// Verify Alchemy webhook signature
function verifyAlchemySignature(body: string, signature: string): boolean {
  if (!ALCHEMY_SIGNING_KEY) {
    console.warn('ALCHEMY_WEBHOOK_SIGNING_KEY not set - skipping signature verification');
    return true; // Allow in development, but log warning
  }
  
  const hmac = createHmac('sha256', ALCHEMY_SIGNING_KEY);
  hmac.update(body);
  const expectedSignature = hmac.digest('hex');
  
  return signature === expectedSignature;
}

// Fetch transaction receipt to verify success
async function fetchTransactionReceipt(txHash: string): Promise<{ status: string | null; logs: any[] }> {
  const rpcs = [ALCHEMY_RPC, FALLBACK_RPC];
  
  for (const rpc of rpcs) {
    try {
      const response = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getTransactionReceipt',
          params: [txHash],
          id: 1,
        }),
      });
      
      const data = await response.json();
      if (data.result) {
        return {
          status: data.result.status,
          logs: data.result.logs || [],
        };
      }
    } catch (e) {
      console.warn(`RPC ${rpc} failed for receipt:`, e);
      continue;
    }
  }
  
  return { status: null, logs: [] };
}

// Fetch full transaction data
async function fetchTransaction(txHash: string): Promise<any | null> {
  const rpcs = [ALCHEMY_RPC, FALLBACK_RPC];
  
  for (const rpc of rpcs) {
    try {
      const response = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getTransactionByHash',
          params: [txHash],
          id: 1,
        }),
      });
      
      const data = await response.json();
      if (data.result) {
        return data.result;
      }
    } catch (e) {
      console.warn(`RPC ${rpc} failed for tx:`, e);
      continue;
    }
  }
  
  return null;
}

// Extract amount from transaction logs for SPRINKLES mining
// The fee splitter receives 5% of total, so we multiply by 20 to get total paid
function extractSprinklesAmount(logs: any[]): string {
  const DECIMALS = BigInt("1000000000000000000"); // 10^18
  
  for (const log of logs) {
    const topics = log.topics || [];
    if (topics[0]?.toLowerCase() === TRANSFER_EVENT_TOPIC) {
      const toAddr = '0x' + topics[2]?.slice(26)?.toLowerCase();
      
      // Check if this transfer is TO the fee splitter contract (5% of total)
      if (toAddr === FEE_SPLITTER_ADDRESS) {
        const feeWei = BigInt(log.data);
        // Fee splitter receives 5%, so multiply by 20 to get total paid
        const totalPaidWei = feeWei * BigInt(20);
        const totalPaid = totalPaidWei / DECIMALS;
        return totalPaid.toString();
      }
    }
  }
  
  return '';
}

// Process a single transaction with full verification
async function processTransaction(tx: any, receipt: any): Promise<{ success: boolean; txHash: string; error?: string }> {
  const txHash = tx.hash?.toLowerCase();
  const toAddress = tx.to?.toLowerCase();
  const inputData = tx.input || '';
  const fromAddress = tx.from?.toLowerCase();
  
  if (!txHash || !toAddress || !fromAddress) {
    return { success: false, txHash: txHash || 'unknown', error: 'Missing transaction data' };
  }
  
  // Check if transaction was successful - CRITICAL CHECK
  if (receipt?.status !== '0x1' && receipt?.status !== 1) {
    console.log(`Transaction ${txHash} failed/reverted (status: ${receipt?.status}) - NOT recording`);
    return { success: false, txHash, error: 'Transaction failed/reverted' };
  }
  
  let mineType: 'sprinkles' | 'donut' | null = null;
  let amount = '';
  let message = '';
  
  // Check if it's a SPRINKLES mine
  if (toAddress === SPRINKLES_MINER_ADDRESS && inputData.startsWith(SPRINKLES_MINE_SELECTOR)) {
    mineType = 'sprinkles';
    
    try {
      const params = decodeAbiParameters(
        parseAbiParameters('address to, address referrer, uint256 epochId, uint256 deadline, uint256 maxPrice, string uri'),
        `0x${inputData.slice(10)}` as `0x${string}`
      );
      message = params[5] as string || '';
    } catch (e) {
      console.error('Failed to decode SPRINKLES input:', e);
    }
    
    // Extract amount from logs
    if (receipt?.logs) {
      amount = extractSprinklesAmount(receipt.logs);
    }
  }
  // Check if it's a DONUT mine
  else if (toAddress === DONUT_MULTICALL_ADDRESS && inputData.startsWith(DONUT_MINE_SELECTOR)) {
    try {
      const params = decodeAbiParameters(
        parseAbiParameters('address provider, uint256 epochId, uint256 deadline, uint256 maxPrice, string uri'),
        `0x${inputData.slice(10)}` as `0x${string}`
      );
      
      // Verify provider address matches
      const providerAddress = (params[0] as string).toLowerCase();
      if (providerAddress !== YOUR_PROVIDER_ADDRESS) {
        console.log(`DONUT mine from different provider: ${providerAddress}, skipping`);
        return { success: false, txHash, error: 'Different provider' };
      }
      
      mineType = 'donut';
      message = params[4] as string || '';
      
      // For DONUT, amount is the ETH value
      if (tx.value) {
        const valueWei = BigInt(tx.value);
        amount = formatUnits(valueWei, 18).split('.')[0];
      }
    } catch (e) {
      console.error('Failed to decode DONUT input:', e);
      return { success: false, txHash, error: 'Failed to decode input' };
    }
  }
  
  if (!mineType) {
    return { success: false, txHash, error: 'Not a mine transaction' };
  }
  
  // Store in database
  try {
    // Check if already exists
    const { data: existing } = await supabase
      .from('mining_events')
      .select('id')
      .eq('tx_hash', txHash)
      .maybeSingle();
    
    if (existing) {
      console.log(`Transaction ${txHash} already recorded`);
      return { success: true, txHash };
    }
    
    // Insert new record
    const { error: insertError } = await supabase
      .from('mining_events')
      .insert({
        address: fromAddress,
        tx_hash: txHash,
        mine_type: mineType,
        amount,
        message,
        created_at: new Date().toISOString(),
      });
    
    if (insertError) {
      console.error('Supabase insert error:', insertError);
      return { success: false, txHash, error: `Database error: ${insertError.message}` };
    }
    
    console.log(`Successfully recorded ${mineType} mine: ${txHash} from ${fromAddress} for ${amount}`);
    return { success: true, txHash };
    
  } catch (dbError) {
    console.error('Database error:', dbError);
    return { success: false, txHash, error: 'Database error' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-alchemy-signature') || '';
    
    // Verify signature
    if (!verifyAlchemySignature(body, signature)) {
      console.error('Invalid Alchemy webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    
    const payload = JSON.parse(body);
    console.log('Alchemy webhook received:', JSON.stringify(payload).slice(0, 500));
    
    // Handle different webhook types
    const webhookType = payload.type;
    const event = payload.event;
    
    if (!event) {
      return NextResponse.json({ success: true, message: 'No event data' });
    }
    
    const results: { success: boolean; txHash: string; error?: string }[] = [];
    
    // Handle Address Activity webhook
    if (webhookType === 'ADDRESS_ACTIVITY' || event.activity) {
      const activities = event.activity || [];
      
      for (const activity of activities) {
        const txHash = activity.hash;
        if (!txHash) continue;
        
        const toAddress = activity.toAddress?.toLowerCase();
        
        // Quick check if it's to our contracts
        if (toAddress !== SPRINKLES_MINER_ADDRESS && toAddress !== DONUT_MULTICALL_ADDRESS) {
          continue;
        }
        
        // IMPORTANT: Fetch full transaction and receipt to verify success
        console.log(`Fetching details for tx: ${txHash}`);
        
        const [tx, receiptData] = await Promise.all([
          fetchTransaction(txHash),
          fetchTransactionReceipt(txHash),
        ]);
        
        if (!tx) {
          console.log(`Could not fetch transaction ${txHash}`);
          results.push({ success: false, txHash, error: 'Could not fetch transaction' });
          continue;
        }
        
        // Verify transaction succeeded before recording
        if (receiptData.status !== '0x1') {
          console.log(`Transaction ${txHash} FAILED (status: ${receiptData.status}) - NOT recording`);
          results.push({ success: false, txHash, error: 'Transaction failed/reverted' });
          continue;
        }
        
        // Process with full data
        const result = await processTransaction(tx, { status: receiptData.status, logs: receiptData.logs });
        results.push(result);
      }
    }
    
    // Handle Mined Transaction webhook (more detailed)
    if (event.transaction || event.transactions) {
      const transactions = event.transactions || [event.transaction];
      
      for (const tx of transactions) {
        if (!tx) continue;
        
        let receipt = event.receipt || tx.receipt;
        
        // If no receipt in payload, fetch it
        if (!receipt) {
          const receiptData = await fetchTransactionReceipt(tx.hash);
          receipt = { status: receiptData.status, logs: receiptData.logs };
        }
        
        const result = await processTransaction(tx, receipt);
        results.push(result);
      }
    }
    
    // Handle Custom Webhook with logs
    if (event.logs) {
      console.log('Received logs webhook with', event.logs.length, 'logs');
    }
    
    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Also support GET for webhook verification
export async function GET(request: NextRequest) {
  return NextResponse.json({ status: 'Alchemy webhook endpoint active' });
}