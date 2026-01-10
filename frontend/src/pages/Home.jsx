function Home() {

  return (
    <div className="space-y-4 sm:space-y-6 px-2 sm:px-4 md:px-6 lg:px-8">
      <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-center">SHOP BY CATEGORY</h1>
      {
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-3 sm:gap-4 md:gap-5 lg:gap-6">
        <div className="relative rounded-xl sm:rounded-2xl bg-white shadow-lg border overflow-hidden p-1.5 sm:p-2 md:p-3 lg:p-4">
          <img src="/categoryshop/dog.png" alt="DOGS" className="w-full h-48 sm:h-56 md:h-64 lg:h-72 xl:h-80 object-cover rounded-xl sm:rounded-2xl"/>
          <div className="absolute right-2 sm:right-3 md:right-4 lg:right-6 bottom-2 sm:bottom-3 md:bottom-4 lg:bottom-6 text-white drop-shadow-lg">
            <h2 className="font-bold text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl">DOGS</h2>
          </div>
        </div>
        <div className="relative rounded-xl sm:rounded-2xl bg-white shadow-sm border overflow-hidden p-1.5 sm:p-2 md:p-3 lg:p-4">
          <img src="/categoryshop/cat.jpg" alt="CATS" className="w-full h-48 sm:h-56 md:h-64 lg:h-72 xl:h-80 object-cover rounded-xl sm:rounded-2xl"/>
          <div className="absolute right-2 sm:right-3 md:right-4 lg:right-6 bottom-2 sm:bottom-3 md:bottom-4 lg:bottom-6 text-white drop-shadow-lg">
            <h2 className="font-bold text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl">CATS</h2>
          </div>
        </div>
        <div className="relative rounded-xl sm:rounded-2xl bg-white shadow-sm border overflow-hidden p-1.5 sm:p-2 md:p-3 lg:p-4">
          <img src="/categoryshop/fish.png" alt="FISH" className="w-full h-48 sm:h-56 md:h-64 lg:h-72 xl:h-80 object-cover rounded-xl sm:rounded-2xl"/>
          <div className="absolute right-2 sm:right-3 md:right-4 lg:right-6 bottom-2 sm:bottom-3 md:bottom-4 lg:bottom-6 text-white drop-shadow-lg">
            <h2 className="font-bold text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl">FISH</h2>
          </div>
        </div>
        <div className="relative rounded-xl sm:rounded-2xl bg-white shadow-sm border overflow-hidden p-1.5 sm:p-2 md:p-3 lg:p-4">
          <img src="/categoryshop/berd.jpg" alt="BIRDS" className="w-full h-48 sm:h-56 md:h-64 lg:h-72 xl:h-80 object-cover rounded-xl sm:rounded-2xl"/>
          <div className="absolute right-2 sm:right-3 md:right-4 lg:right-6 bottom-2 sm:bottom-3 md:bottom-4 lg:bottom-6 text-white drop-shadow-lg">
            <h2 className="font-bold text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl whitespace-nowrap">LIVE PETS</h2>
          </div>
        </div>
        <div className="relative rounded-xl sm:rounded-2xl bg-white shadow-sm border overflow-hidden p-1.5 sm:p-2 md:p-3 lg:p-4">
          <img src="/categoryshop/feeder.jpg" alt="FEEDER" className="w-full h-48 sm:h-56 md:h-64 lg:h-72 xl:h-80 object-cover rounded-xl sm:rounded-2xl"/>
          <div className="absolute right-2 sm:right-3 md:right-4 lg:right-6 bottom-2 sm:bottom-3 md:bottom-4 lg:bottom-6 text-white drop-shadow-lg">
            <h2 className="font-bold text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl">FEEDER</h2>
          </div>
        </div>
        <div className="relative rounded-xl sm:rounded-2xl bg-white shadow-sm border overflow-hidden p-1.5 sm:p-2 md:p-3 lg:p-4">
          <img src="/categoryshop/all.jpeg" alt="ALL PETS" className="w-full h-48 sm:h-56 md:h-64 lg:h-72 xl:h-80 object-cover rounded-xl sm:rounded-2xl"/>
          <div className="absolute right-2 sm:right-3 md:right-4 lg:right-6 bottom-2 sm:bottom-3 md:bottom-4 lg:bottom-6 text-white drop-shadow-lg">
            <h2 className="font-bold text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl">ALL PETS</h2>
          </div>
        </div>
      </section>
      }
    </div>
  )
}

export default Home


