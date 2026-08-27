import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

// random user ID to assign orders to
const TEST_USER_ID = process.argv[2] || null

const STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled']
const PAYMENT_METHODS = ['Cash on Delivery', 'GCash', 'Maya', 'Bank Transfer']

function randomPick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }

async function main() {
  // get the admin user to use as the order owner
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)

  const userId = TEST_USER_ID || profiles?.[0]?.id
  if (!userId) {
    console.error('No user found. Pass a user ID as argument or ensure an admin profile exists.')
    process.exit(1)
  }
  console.log(`Using user ID: ${userId}`)

  // get some products to create orders from
  const { data: products } = await supabase
    .from('product')
    .select('prod_id, prod_name, price, stock_quantity')
    .gt('price', 0)
    .limit(50)

  if (!products || products.length === 0) {
    console.error('No products with prices found.')
    process.exit(1)
  }
  console.log(`Using ${products.length} products`)

  const orders = []

  // create 15 test orders
  for (let i = 0; i < 15; i++) {
    const status = randomPick(STATUSES)
    const numItems = randomInt(1, 4)
    const orderProducts = []
    let totalAmount = 0

    for (let j = 0; j < numItems; j++) {
      const product = randomPick(products)
      const qty = randomInt(1, 3)
      const subtotal = product.price * qty
      totalAmount += subtotal
      orderProducts.push({ ...product, qty, subtotal })
    }

    const orderDate = new Date()
    orderDate.setDate(orderDate.getDate() - randomInt(0, 30))

    // insert order
    const firstProduct = orderProducts[0]
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        id: userId,
        prod_id: firstProduct.prod_id,
        orderDate: orderDate.toISOString(),
        status,
        total_amount: totalAmount,
      })
      .select('order_id')
      .single()

    if (orderErr) {
      console.error('Order insert failed:', orderErr.message)
      continue
    }

    console.log(`Order ${i + 1}: ${order.order_id} - ${status} - PHP ${totalAmount.toFixed(2)}`)

    // insert order items
    for (const item of orderProducts) {
      await supabase
        .from('order_details')
        .insert({
          order_id: order.order_id,
          prod_id: item.prod_id,
          quantity: item.qty,
          subtotal: item.subtotal,
        })
    }

    // insert payment for non-cancelled orders
    if (status !== 'Cancelled') {
      const method = randomPick(PAYMENT_METHODS)
      await supabase
        .from('payment')
        .insert({
          order_id: order.order_id,
          method,
          amount: totalAmount,
        })

      // insert sale record
      await supabase
        .from('sales')
        .insert({
          order_id: order.order_id,
          total_amount: totalAmount,
          profit: totalAmount * 0.3,
          report_date: orderDate.toISOString(),
        })
    }

    orders.push(order)
  }

  console.log(`\nDone! Created ${orders.length} test orders with payments and sales data.`)
}

main().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
