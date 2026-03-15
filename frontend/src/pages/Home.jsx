// the home page - shows the category grid and product carousels
// right now everything is hardcoded, but eventually these will come
// from the supabase database so the admin can manage them
function Home() {
  // product categories - each product belongs to one of these
  // the displayName is what shows up on the page (uppercase for style)
  const categories = [
    {
      id: 1,
      name: "best seller",
      displayName: "BEST SELLERS"
    },
    {
      id: 2,
      name: "new arrivals",
      displayName: "NEW ARRIVALS"
    }
  ];

  // hardcoded product list - categoryId links each product to a category above
  // prices are in PHP, images are in the public/categoryshop folder
  const products = [
    {
      id: 1,
      name: "Pet Goats Powder Milk",
      price: 200.00,
      image: "/categoryshop/dog.jpg",
      categoryId: 2
    },
    {
      id: 2,
      name: "Ciao Can Treats",
      price: 150.00,
      image: "/categoryshop/cat.jpg",
      categoryId: 1
    },
    {
      id: 3,
      name: "Premium Dog Food",
      price: 350.00,
      image: "/categoryshop/dog.png",
      categoryId: 1
    },
    {
      id: 4,
      name: "Cat Vitamins",
      price: 280.00,
      image: "/categoryshop/fish.png",
      categoryId: 2
    },
    {
      id: 5,
      name: "Bird Cage Accessories",
      price: 450.00,
      image: "/categoryshop/berd.jpg",
      categoryId: 1
    },
    {
      id: 6,
      name: "Automatic Pet Feeder",
      price: 1200.00,
      image: "/categoryshop/feeder.jpg",
      categoryId: 2
    },
    {
      id: 7,
      name: "Aquarium Filter System",
      price: 550.00,
      image: "/categoryshop/fish.webp",
      categoryId: 1
    },
    {
      id: 8,
      name: "Pet Grooming Kit",
      price: 320.00,
      image: "/categoryshop/all.png",
      categoryId: 2
    },
    {
      id: 9,
      name: "Dog Training Treats",
      price: 180.00,
      image: "/categoryshop/all.jpeg",
      categoryId: 1
    },
    {
      id: 10,
      name: "Cat Scratching Post",
      price: 650.00,
      image: "/categoryshop/cat.jpg",
      categoryId: 2
    },
    {
      id: 11,
      name: "Pet Carrier Bag",
      price: 420.00,
      image: "/categoryshop/dog.jpg",
      categoryId: 1
    },
    {
      id: 12,
      name: "Fish Tank Decorations",
      price: 250.00,
      image: "/categoryshop/fish.png",
      categoryId: 2
    },
    {
      id: 13,
      name: "Bird Seed Mix",
      price: 120.00,
      image: "/categoryshop/berd.jpg",
      categoryId: 1
    },
    {
      id: 14,
      name: "Pet Bed Premium",
      price: 850.00,
      image: "/categoryshop/feeder.jpg",
      categoryId: 2
    }
  ];

  // helper to look up a category by its id - used to show the category badge on product cards
  const getCategoryById = (categoryId) => {
    return categories.find(cat => cat.id === categoryId);
  };

  // filters the products array to only return products in a specific category
  const getProductsByCategory = (categoryId) => {
    return products.filter(product => product.categoryId === categoryId);
  };

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6 lg:space-y-8 px-2 sm:px-4 md:px-6 lg:px-8 xl:px-12 2xl:px-16">
      <h1 className="text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl 2xl:text-4xl font-bold text-center px-2">SHOP BY CATEGORY</h1>

      {/* the category grid — 6 clickable cards with images (food, vitamins, accessories, etc.)
          these are static for now but could be dynamic later */}
      <section className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 md:gap-4 lg:gap-5 xl:gap-6 mx-4 sm:mx-6 md:mx-10 lg:mx-16 xl:mx-20 2xl:mx-28">
        <div className="relative rounded-md sm:rounded-lg md:rounded-xl lg:rounded-2xl bg-white shadow-md sm:shadow-lg border overflow-hidden p-1 sm:p-2 md:p-3 lg:p-4 xl:p-5 transition-transform duration-300 hover:scale-105 active:scale-95 cursor-pointer">
          <img src="/categoryshop/dog.jpg" alt="DOGS" className="w-full h-24 sm:h-32 md:h-40 lg:h-56 xl:h-64 2xl:h-72 object-cover rounded-md sm:rounded-lg md:rounded-xl lg:rounded-2xl"/>
          <div className="absolute right-1 sm:right-2 md:right-3 lg:right-4 xl:right-6 bottom-1 sm:bottom-2 md:bottom-3 lg:bottom-4 xl:bottom-6 text-white drop-shadow-lg max-w-[90%] sm:max-w-[85%] md:max-w-none text-right">
            <h2 className="font-bold text-[10px] sm:text-xs md:text-sm lg:text-lg xl:text-xl 2xl:text-2xl leading-tight">FOOD</h2>
          </div>
        </div>
        <div className="relative rounded-md sm:rounded-lg md:rounded-xl lg:rounded-2xl bg-white shadow-md sm:shadow-lg border overflow-hidden p-1 sm:p-2 md:p-3 lg:p-4 xl:p-5 transition-transform duration-300 hover:scale-105 active:scale-95 cursor-pointer">
          <img src="/categoryshop/cat.jpg" alt="CATS" className="w-full h-24 sm:h-32 md:h-40 lg:h-56 xl:h-64 2xl:h-72 object-cover rounded-md sm:rounded-lg md:rounded-xl lg:rounded-2xl"/>
          <div className="absolute right-1 sm:right-2 md:right-3 lg:right-4 xl:right-6 bottom-1 sm:bottom-2 md:bottom-3 lg:bottom-4 xl:bottom-6 text-white drop-shadow-lg max-w-[90%] sm:max-w-[85%] md:max-w-none text-right">
            <h2 className="font-bold text-[10px] sm:text-xs md:text-sm lg:text-base xl:text-lg 2xl:text-xl leading-tight">VITAMINS AND MEDICINE</h2>
          </div>
        </div>
        <div className="relative rounded-md sm:rounded-lg md:rounded-xl lg:rounded-2xl bg-white shadow-md sm:shadow-lg border overflow-hidden p-1 sm:p-2 md:p-3 lg:p-4 xl:p-5 transition-transform duration-300 hover:scale-105 active:scale-95 cursor-pointer">
          <img src="/categoryshop/fish.png" alt="FISH" className="w-full h-24 sm:h-32 md:h-40 lg:h-56 xl:h-64 2xl:h-72 object-cover rounded-md sm:rounded-lg md:rounded-xl lg:rounded-2xl"/>
          <div className="absolute right-1 sm:right-2 md:right-3 lg:right-4 xl:right-6 bottom-1 sm:bottom-2 md:bottom-3 lg:bottom-4 xl:bottom-6 text-white drop-shadow-lg max-w-[90%] sm:max-w-[85%] md:max-w-none text-right">
            <h2 className="font-bold text-[10px] sm:text-xs md:text-sm lg:text-lg xl:text-xl 2xl:text-2xl leading-tight">ACCESSORIES</h2>
          </div>
        </div>
        <div className="relative rounded-md sm:rounded-lg md:rounded-xl lg:rounded-2xl bg-white shadow-md sm:shadow-lg border overflow-hidden p-1 sm:p-2 md:p-3 lg:p-4 xl:p-5 transition-transform duration-300 hover:scale-105 active:scale-95 cursor-pointer">
          <img src="/categoryshop/berd.jpg" alt="BIRDS" className="w-full h-24 sm:h-32 md:h-40 lg:h-56 xl:h-64 2xl:h-72 object-cover rounded-md sm:rounded-lg md:rounded-xl lg:rounded-2xl"/>
          <div className="absolute right-1 sm:right-2 md:right-3 lg:right-4 xl:right-6 bottom-1 sm:bottom-2 md:bottom-3 lg:bottom-4 xl:bottom-6 text-white drop-shadow-lg max-w-[90%] sm:max-w-[85%] md:max-w-none text-right">
            <h2 className="font-bold text-[10px] sm:text-xs md:text-sm lg:text-lg xl:text-xl 2xl:text-2xl leading-tight">CAGES</h2>
          </div>
        </div>
        <div className="relative rounded-md sm:rounded-lg md:rounded-xl lg:rounded-2xl bg-white shadow-md sm:shadow-lg border overflow-hidden p-1 sm:p-2 md:p-3 lg:p-4 xl:p-5 transition-transform duration-300 hover:scale-105 active:scale-95 cursor-pointer">
          <img src="/categoryshop/feeder.jpg" alt="FEEDER" className="w-full h-24 sm:h-32 md:h-40 lg:h-56 xl:h-64 2xl:h-72 object-cover rounded-md sm:rounded-lg md:rounded-xl lg:rounded-2xl"/>
          <div className="absolute right-1 sm:right-2 md:right-3 lg:right-4 xl:right-6 bottom-1 sm:bottom-2 md:bottom-3 lg:bottom-4 xl:bottom-6 text-white drop-shadow-lg max-w-[90%] sm:max-w-[85%] md:max-w-none text-right">
            <h2 className="font-bold text-[10px] sm:text-xs md:text-sm lg:text-lg xl:text-xl 2xl:text-2xl leading-tight">LIVE PETS</h2>
          </div>
        </div>
        <div className="relative rounded-md sm:rounded-lg md:rounded-xl lg:rounded-2xl bg-white shadow-md sm:shadow-lg border overflow-hidden p-1 sm:p-2 md:p-3 lg:p-4 xl:p-5 transition-transform duration-300 hover:scale-105 active:scale-95 cursor-pointer">
          <img src="/categoryshop/all.jpeg" alt="ALL PETS" className="w-full h-24 sm:h-32 md:h-40 lg:h-56 xl:h-64 2xl:h-72 object-cover rounded-md sm:rounded-lg md:rounded-xl lg:rounded-2xl"/>
          <div className="absolute right-1 sm:right-2 md:right-3 lg:right-4 xl:right-6 bottom-1 sm:bottom-2 md:bottom-3 lg:bottom-4 xl:bottom-6 text-white drop-shadow-lg max-w-[90%] sm:max-w-[85%] md:max-w-none text-right">
            <h2 className="font-bold text-[10px] sm:text-xs md:text-sm lg:text-lg xl:text-xl 2xl:text-2xl leading-tight">PET EQUIPMENT</h2>
          </div>
        </div>
      </section>

      {/* product carousels - one horizontal scrollable row per category
          loops through each category and renders up to 7 products
          each product card has a banner, image, category badge, price, and add-to-cart button */}
      {categories.map((category) => {
        const categoryProducts = getProductsByCategory(category.id);
        return (
          <div key={category.id} className="mt-6 sm:mt-8 md:mt-12 lg:mt-16 xl:mt-20 mx-4 sm:mx-6 md:mx-10 lg:mx-16 xl:mx-20 2xl:mx-28">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 mb-3 sm:mb-4 md:mb-6 px-1 sm:px-0">
              <h2 className="text-base sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl 2xl:text-5xl font-bold text-red-600">{category.displayName}</h2>
              <a href="#" className="text-blue-600 hover:underline text-xs sm:text-sm md:text-base lg:text-lg xl:text-xl font-semibold uppercase whitespace-nowrap">VIEW ALL</a>
            </div>
            {/* horizontal scroll container - overflow-x-auto lets you swipe on mobile */}
            <div className="flex gap-2 sm:gap-3 md:gap-4 lg:gap-5 xl:gap-6 overflow-x-auto pb-3 sm:pb-4 scrollbar-hide px-1 sm:px-0">
              {categoryProducts.slice(0, 7).map((product) => {
                const productCategory = getCategoryById(product.categoryId);
                return (
                  <div key={product.id} className="flex-shrink-0 w-40 sm:w-44 md:w-52 lg:w-60 xl:w-72 2xl:w-80 bg-white border border-gray-200 rounded-md sm:rounded-lg md:rounded-xl shadow-sm overflow-hidden">
                    <div className="bg-blue-600 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-2.5 flex items-center gap-1.5 sm:gap-2">
                      <img src="/logo/logo-whiskers.png" alt="WHISKERS" className="h-4 sm:h-5 md:h-6 lg:h-7 xl:h-8 w-auto"/>
                      <span className="text-white font-bold text-[10px] sm:text-xs md:text-sm lg:text-base">WHISKERS</span>
                    </div>
                    <div className="p-2 sm:p-3 md:p-4 bg-gray-50 flex items-center justify-center h-28 sm:h-32 md:h-36 lg:h-40 xl:h-44 2xl:h-48">
                      <img src={product.image} alt={product.name} className="max-h-full max-w-full object-contain"/>
                    </div>
                    <div className="p-2 sm:p-3 md:p-4 space-y-1 sm:space-y-1.5 md:space-y-2">
                      {productCategory && (
                        <span className="inline-block bg-red-800 text-white text-[9px] sm:text-[10px] md:text-xs lg:text-sm font-semibold px-1.5 sm:px-2 md:px-2.5 lg:px-3 py-0.5 sm:py-1 md:py-1.5 rounded-full leading-tight">
                          {productCategory.displayName}
                        </span>
                      )}
                      <p className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-gray-800 line-clamp-2 leading-tight">{product.name}</p>
                      <p className="text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl font-bold text-gray-900">PHP {product.price.toFixed(2)}</p>
                    </div>
                    <div className="p-2 sm:p-3 md:p-4">
                      <button className="w-full bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-600 text-gray-900 font-semibold py-1.5 sm:py-2 md:py-2.5 lg:py-3 rounded-md flex items-center justify-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs md:text-sm lg:text-base transition-colors touch-manipulation min-h-[36px] sm:min-h-[40px] md:min-h-[44px]">
                        <svg className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <span className="whitespace-nowrap">ADD TO CART</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  )
}

export default Home
