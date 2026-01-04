// app/api/webhooks/alchemy/route.ts
// Alchemy webhook handler for mining events - more reliable than client-side reporting

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

// Your provider address - only DONUT mines through this provider count
const YOUR_PROVIDER_ADDRESS = '0x30cb501B97c6b87B7b240755C730A9795dBB84f5'.toLowerCase();

// Function selectors
const SPRINKLES_MINE_SELECTOR = keccak256(toBytes('mine(address,address,uint256,uint256,uint256,string)')).slice(0, 10);
const DONUT_MINE_SELECTOR = keccak256(toBytes('mine(address,uint256,uint256,uint256,string)')).slice(0, 10);

// Transfer event topic for extracting amounts
const TRANSFER_EVENT_TOPIC = keccak256(toBytes('Transfer(address,address,uint256)')).toLowerCase();

// Alchemy webhook signing key - set this in your environment variables
const ALCHEMY_SIGNING_KEY = process.env.ALCHEMY_WEBHOOK_SIGNING_KEY || '';

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

// Extract amount from transaction logs for SPRINKLES mining
function extractSprinklesAmount(logs: any[]): string {
  const DECIMALS = BigInt("1000000000000000000"); // 10^18
  
  for (const log of logs) {
    const topics = log.topics || [];
    if (topics[0]?.toLowerCase() === TRANSFER_EVENT_TOPIC) {
      const toAddr = '0x' + topics[2]?.slice(26)?.toLowerCase();
      
      // Check if this transfer is TO the sprinkles miner contract (10% fee)
      if (toAddr === SPRINKLES_MINER_ADDRESS) {
        const feeWei = BigInt(log.data);
        // Miner receives 10% fee, so multiply by 10 to get total paid
        const totalPaidWei = feeWei * BigInt(10);
        const totalPaid = totalPaidWei / DECIMALS;
        return totalPaid.toString();
      }
    }
  }
  
  return '';
}

// Process a single transaction
async function processTransaction(tx: any, receipt: any): Promise<{ success: boolean; txHash: string; error?: string }> {
  const txHash = tx.hash?.toLowerCase();
  const toAddress = tx.to?.toLowerCase();
  const inputData = tx.input || '';
  const fromAddress = tx.from?.toLowerCase();
  
  if (!txHash || !toAddress || !fromAddress) {
    return { success: false, txHash: txHash || 'unknown', error: 'Missing transaction data' };
  }
  
  // Check if transaction was successful
  if (receipt?.status !== '0x1' && receipt?.status !== 1) {
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
      
      // Check if this mine used our provider
      const providerAddress = (params[0] as string).toLowerCase();
      if (providerAddress !== YOUR_PROVIDER_ADDRESS) {
        console.log(`DONUT mine used different provider: ${providerAddress}, skipping`);
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
        // We need the full transaction and receipt
        // For address activity, we get limited data, so we may need to fetch more
        const txHash = activity.hash;
        
        if (!txHash) continue;
        
        // The activity webhook gives us basic info
        // For full processing, we'd need to fetch tx details
        // But we can still record basic info
        const fromAddress = activity.fromAddress?.toLowerCase();
        const toAddress = activity.toAddress?.toLowerCase();
        
        // Quick check if it's to our contracts
        if (toAddress !== SPRINKLES_MINER_ADDRESS && toAddress !== DONUT_MULTICALL_ADDRESS) {
          continue;
        }
        
        // For now, record with what we have and let the full data come from rawContract
        if (activity.rawContract?.rawValue && toAddress === SPRINKLES_MINER_ADDRESS) {
          // Check if already exists
          const { data: existing } = await supabase
            .from('mining_events')
            .select('id')
            .eq('tx_hash', txHash.toLowerCase())
            .maybeSingle();
          
          if (!existing) {
            // Calculate amount from value if available
            let amount = '';
            if (activity.value) {
              // This might be the fee transfer, multiply by 10
              const value = parseFloat(activity.value);
              if (value > 0) {
                amount = Math.floor(value * 10).toString();
              }
            }
            
            await supabase
              .from('mining_events')
              .insert({
                address: fromAddress,
                tx_hash: txHash.toLowerCase(),
                mine_type: 'sprinkles',
                amount,
                message: '',
                created_at: new Date().toISOString(),
              });
            
            console.log(`Recorded from activity: ${txHash}`);
            results.push({ success: true, txHash });
          }
        }
      }
    }
    
    // Handle Mined Transaction webhook (more detailed)
    if (event.transaction || event.transactions) {
      const transactions = event.transactions || [event.transaction];
      
      for (const tx of transactions) {
        if (!tx) continue;
        
        const receipt = event.receipt || tx.receipt;
        const result = await processTransaction(tx, receipt);
        results.push(result);
      }
    }
    
    // Handle Custom Webhook with logs
    if (event.logs) {
      // Process logs if needed
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