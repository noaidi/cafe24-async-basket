class AsyncCart {
	constructor() {
		this.cartItems = []
		this.updateTimeout = null
	}

	findBasketItem(basketNo) {
		const basketItem = this.cartItems[basketNo]
		if (!basketItem) {
			throw new Error('상품을 찾을 수 없습니다')
		}
		return basketItem
	}

	updateQuantityDOM(index, quantity) {
		const quantityInput = document.querySelector(`#quantity_id_${index}`)
		if (quantityInput) {
			quantityInput.value = quantity
		}
	}

	async deleteCartItems(items) {
		try {
			// 단일 아이템을 배열로 변환
			const deleteProducts = Array.isArray(items) ? items : [items]

			if (
				!deleteProducts.length ||
				!deleteProducts.every(
					item => item?.product_no && item?.basket_product_no,
				)
			) {
				throw new Error('Invalid basket items')
			}

			const formattedProducts = deleteProducts.map(item => ({
				product_no: item.product_no,
				option_id: item.option_id,
				basket_product_no: item.basket_product_no,
			}))

			await CAPP_ASYNC_METHODS.BasketProduct.deleteCartItems(
				'A',
				formattedProducts,
			)

			return true
		} catch (err) {
			console.error('상품 삭제 중 오류:', err)
			return false
		}
	}

	async executeModifyQuantity(index, newQuantity) {
		try {
			const basketItem = this.findBasketItem(index)

			// DOM은 즉시 업데이트 - 모든 클릭 반영
			this.updateQuantityDOM(index, newQuantity)

			// 진행 중인 타이머가 있다면 취소
			if (this.updateTimeout) {
				clearTimeout(this.updateTimeout)
			}

			// 새로운 API 요청 타이머 설정
			await new Promise(resolve => {
				this.updateTimeout = setTimeout(async () => {
					try {
						const postData = {
							command: 'update',
							num_of_prod: 1,
							[`prod_id0`]: `${basketItem.product_no}:${basketItem.option_id}:${basketItem.set_product_no || 0}:${basketItem.delvtype || ''}`,
							[`quantity0`]: newQuantity,
							basket_type: 'A0000',
							delvtype: basketItem.delvtype || '',
							basket_prd_no: basketItem.basket_prd_no,
						}
						await CAPP_ASYNC_METHODS.BasketProduct.setAsyncData(
							postData,
						)
						await this.updateCart()
						resolve()
					} catch (error) {
						console.error('API 요청 중 오류:', error)
						resolve()
					}
				}, 300)
			})

			return true
		} catch (err) {
			console.error('수량 변경 중 오류 발생:', err)
			return false
		}
	}

	async changeQuantity(basketNo, newQuantity) {
		try {
			this.updateQuantityDOM(basketNo, newQuantity)
			return this.executeModifyQuantity(basketNo, newQuantity)
		} catch (error) {
			console.error(error)
			return false
		}
	}

	async increaseQuantity(basketNo) {
		try {
			const basketItem = this.findBasketItem(basketNo)

			// DOM 즉시 업데이트 후 실제 수량 변경
			const newQuantity = basketItem.quantity + 1
			this.updateQuantityDOM(basketNo, newQuantity)
			return this.executeModifyQuantity(basketNo, newQuantity)
		} catch (error) {
			console.error(error)
			return false
		}
	}

	async decreaseQuantity(basketNo) {
		try {
			const basketItem = this.findBasketItem(basketNo)

			if (basketItem.quantity <= 1) {
				alert('최소 수량은 1개입니다.')
				return false
			}

			// DOM 즉시 업데이트 후 실제 수량 변경
			const newQuantity = basketItem.quantity - 1
			this.updateQuantityDOM(basketNo, newQuantity)
			return this.executeModifyQuantity(basketNo, newQuantity)
		} catch (error) {
			console.error(error)
			return false
		}
	}

	async updateCart() {
		try {
			await this.restoreCache()
			this.cartItems = await this.getCartItemList()

			return true
		} catch (error) {
			console.error('장바구니 업데이트 중 오류 발생:', error)
			return false
		}
	}

	async restoreCache() {
		try {
			return await CAPP_ASYNC_METHODS.BasketProduct.restoreCache()
		} catch (err) {
			throw new Error('캐시 초기화 실패: ' + err)
		}
	}

	async init() {
		try {
			if (!CAPP_ASYNC_METHODS) {
				CAPP_ASYNC_METHODS.init()
			}

			const updateSuccess = await this.updateCart()
			if (!updateSuccess) {
				throw new Error('장바구니 초기화 실패')
			}
			return true
		} catch (error) {
			console.error('장바구니 초기화 중 오류 발생:', error)
			return false
		}
	}

	async fetchProductData() {
		const url = '/layout/cart-info.html'

		try {
			const response = await fetch(url)
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`)
			}

			const html = await response.text()
			const parser = new DOMParser()
			const doc = parser.parseFromString(html, 'text/html')
			const script = doc.querySelector('script:last-child')
			const lines = script?.textContent.split('\n')
			const result =
				lines
					?.filter(line => line.includes('aBasketProductData['))
					.join('\n')
			if (result) {
				aBasketProductData = []
				eval(result)
			}
		} catch (error) {
			console.error('Error fetching or parsing page:', error)
			return null
		}
	}

	async getCartItemList() {
		try {
			const cartItems = await CAPP_ASYNC_METHODS.BasketProduct.getData()
			if (!cartItems) {
				throw new Error('카트 데이터가 없습니다')
			}

			await this.fetchProductData()

			document.querySelectorAll('button.cart .count').forEach(elem => {
				elem.setAttribute('data-count', cartItems.length)
			})

			return cartItems
		} catch (err) {
			console.error('카트 목록 조회 실패:', err)
			throw err
		}
	}

	parseToNumber(value) {
		if (typeof value === 'string') {
			// 쉼표 제거 후 숫자로 변환
			return parseFloat(value.replace(/,/g, ''))
		}
		return typeof value === 'number' ? value : 0
		// 숫자라면 그대로 반환
	}
}

let cartHelper

// 초기화 함수
const initializeCart = async () => {
	cartHelper = new AsyncCart()
	await cartHelper.init()
}

const elemToId = elem =>
	Number(
		elem
			.closest('.xans-record-')
			?.querySelector('input[type="checkbox"]')
			?.getAttribute('id')
			?.split('basket_chk_id_')[1],
	)

const refetchCart = async () => {
	htmx.trigger(document.querySelector('button.cart'), 'click')
}

document.body.addEventListener('htmx:afterSwap', event => {
	const target = document.querySelector('#cart-layer .main')
	if (event.target === target) {
		target.querySelectorAll('[id^="quantity_id_"]').forEach(input => {
			input.addEventListener('change', async () => {
				if (!input.value) {
					input.value = 1
				}

				await cartHelper.changeQuantity(
					elemToId(input),
					Number(input.value),
				)
				refetchCart()
			})
		})
	}
})

// 글로벌 수량 변경 함수들
const decreaseQuantity = async elem => {
	try {
		if (!cartHelper) {
			throw new Error('장바구니가 초기화되지 않았습니다')
		}

		await cartHelper.decreaseQuantity(elemToId(elem))
		refetchCart()
	} catch (error) {
		console.error(error)
	}
}

const increaseQuantity = async elem => {
	try {
		if (!cartHelper) {
			throw new Error('장바구니가 초기화되지 않았습니다')
		}

		await cartHelper.increaseQuantity(elemToId(elem))
		refetchCart()
	} catch (error) {
		console.error(error)
	}
}

const deleteCartItem = async elem => {
	try {
		if (!confirm('선택하신 상품을 삭제하시겠습니까?')) {
			return
		}

		const needToRefetch = cartHelper.cartItems.length === 1

		// 삭제할 요소와 전체 장바구니 항목 리스트 찾기
		const targetEl = elem.closest('.xans-record-')
		const allItems = elem
			.closest('.xans-order-list')
			?.querySelectorAll('& > .xans-record-')

		// 실제 DOM에서의 인덱스 찾기
		const basketNo = Array.from(allItems).indexOf(targetEl)

		if (basketNo === -1) {
			throw new Error('상품 위치를 찾을 수 없습니다')
		}

		const basketItem = cartHelper.findBasketItem(basketNo)
		const delRes = await cartHelper.deleteCartItems(basketItem)
		if (!delRes) {
			throw new Error('상품을 장바구니에서 삭제하지 못했습니다.')
		}

		targetEl.remove()
		const updateRes = await cartHelper.updateCart()
		if (!updateRes) {
			throw new Error('장바구니 업데이트에 문제가 있습니다.')
		}

		if (needToRefetch) {
			refetchCart()
		}
	} catch (err) {
		console.error(err)
	}
}

window.addEventListener('load', async () => {
	await initializeCart()

	const cartLayer = document.getElementById('cart-layer')
	if (cartLayer) {
		const open = async () => {
			cartLayer.classList.add('opening')
			setTimeout(() => {
				cartLayer.classList.add('opened')
			})
			await cartHelper.updateCart()
		}

		const close = () => {
			cartLayer.classList.remove('opened')
			setTimeout(() => {
				cartLayer.classList.remove('opening')
			}, 200)
		}

		document.querySelectorAll('button.cart').forEach(a => {
			a.addEventListener('click', open)
		})

		cartLayer
			.querySelector('& > .backdrop')
			?.addEventListener('click', close)
	}
})
