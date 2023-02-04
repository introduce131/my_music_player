import React from 'react';
import { fireStore, storage } from './firebase.js';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import Swal from 'sweetalert2';
import { addDoc, collection } from 'firebase/firestore';

/** 상품 고유 ID 생성 */
export const createID = () => {
  return Math.random().toString(36).substring(2, 11);
};

/** byte수를 계산하는 메서드 객체 */
export const calByte = {
  // getByteLength : 입력된 글자 전체의 byte를 계산해서 return
  getByteLength: function (s) {
    if (s == null || s.length == 0) {
      return 0;
    }
    let size = 0;
    for (let i = 0; i < s.length; i++) {
      size += this.charByteSize(s.charAt(i));
    }
    return size;
  },

  // cutByteLength : 원하는 byte 만큼 글자를 잘라서 return
  cutByteLength: function (s, len) {
    if (s == null || s.length == 0) {
      return 0;
    }
    let size = 0;
    let rIndex = s.length;

    for (let i = 0; i < s.length; i++) {
      size += this.charByteSize(s.charAt(i));
      if (size == len) {
        rIndex = i + 1;
        break;
      } else if (size > len) {
        rIndex = i;
        break;
      }
    }
    return s.substring(0, rIndex);
  },

  // charByteSize : 한글자에 대한 byte를 계산하는 메서드
  charByteSize: function (ch) {
    if (ch == null || ch.length == 0) {
      return 0;
    }
    let charCode = ch.charCodeAt(0);

    if (charCode <= 0x00007f) {
      return 1;
    } else if (charCode <= 0x0007ff) {
      return 2;
    } else if (charCode <= 0x00ffff) {
      return 3;
    }
  },
};

/** 천단위에 콤마 찍기 함수 */
export const addCommas = (num) => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 숫자만 입력 받을 수 있게 적용하는 함수 */
export const removeNonNumeric = (num) => num.toString().replace(/[^0-9]/g, '');

/** option 데이터 리스트를 만들어서 반환하는 함수 */
export function optionDataList(firstArray, secondArray, priceRef) {
  let dataList = [];
  let dataRow = {};
  let sizeArray = [];
  let colorArray = [];
  let cnt = 0;

  // 상품가격을 받아와서 저장
  const priceValue = priceRef.current.value;

  try {
    // firstArray, secondArray 둘중 누가 색상값을 가지고 있는지 확인
    firstArray[0].color
      ? ((colorArray = [...firstArray]), (sizeArray = [...secondArray]))
      : ((colorArray = [...secondArray]), (sizeArray = [...firstArray]));

    for (let i = 0; i < sizeArray.length; i++) {
      dataRow = new Object();
      for (let j = 0; j < colorArray.length; j++) {
        dataRow = new Object();
        dataRow.id = cnt;
        dataRow.size = sizeArray[i].value;
        dataRow.color = colorArray[j].color;
        dataRow.colorName = colorArray[j].value;
        dataRow.price = priceValue;
        dataRow.stockNow = 0;
        dataRow.stockAdd = 0;
        dataRow.status = '';
        dataList[cnt] = dataRow;
        cnt++; //카운트 1 증가
      }
    }
  } catch (e) {
    console.log(e);
  }

  return dataList;
}

/** Editor의 ref를 받아서 <img src=".."> 를 배열로 반환하는 함수 */
export function returnEditorImg(ref) {
  const content = ref.current.value;
  const result = Array.from(content.matchAll(/<img[^>]+src=["']([^'">]+)['"]/gi));
  let returnArray = [];

  console.log('result', result);

  for (let i = 0; i < result.length; i++) {
    const tempArray = result[i];
    //const tag = tempArray[0].replace(/&amp;/gi, '&'); // &amp 제거
    const url = tempArray[1].replace(/&amp;/gi, '&'); // &amp 제거
    returnArray[i] = url;
  }

  return returnArray;
}

export function limitTextAreaLine(e, maxRows) {
  // 10줄 이상 키보드 입력 엔터 막기
  const lines = e.target.value.split('\n').length;
  if (lines > maxRows - 1 && e.key === 'Enter') {
    e.preventDefault();
  }
}

/** inputText에서 금액을 입력할 때, 천단위 숫자를 찍어주는 함수 */
export function inputNumberFormat(obj) {
  obj.current.value = comma(uncomma(obj.current.value));
}

/** 콤마 씌우기 */
export function comma(str) {
  str = String(str);
  return str.replace(/(\d)(?=(?:\d{3})+(?!\d))/g, '$1,');
}

/** 콤마 지우기 */
export function uncomma(str) {
  str = String(str);
  return str.replace(/[^\d]+/g, '');
}

/* -------------------------------- */
/*    firebase, storage 관련 함수    */
/* -------------------------------- */

/** firebase Storage에 이미지를 업로드하는 Promise 반환 함수
 * (파일), (서버파일경로), (percent setState) */
export const imageFileUpload = async (paraFile, filePath, setPercent) => {
  return new Promise((resolve, reject) => {
    /** <스토리지(저장소) 참조 생성 => 작업하려는 클라우드 파일에 대한 포인터 역할>
     *  firebase/storage에서 ref함수를 가져오고 파라미터로
     *  (저장소 서비스), (파일경로)를 인수로 전달함 */
    const storageRef = ref(storage, filePath);
    /**  uploadBytesResumable()에 인스턴스를 전달하여 업로드 작업을 만듬.*/
    const uploadTask = uploadBytesResumable(storageRef, paraFile);

    /** state_changed 이벤트에는 3가지 콜백함수가 있다
     *  1번째 콜백함수 : 업로드 진행 상황 추적, 진행 상태 업로드
     *  2번째 콜백함수 : 업로드 실패 시 오류를 처리
     *  3번째 콜백함수 : 업로드가 완료되면 실행되고, 다운로드 URL을 가져오고 콘솔에 표시
     *                  fireStore 데이터베이스에 저장해도 됨.
     */
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        //퍼센트 값 = 반올림(지금까지 성공적으로 업로드된 byte 수 / 업로드할 총 byte 수)
        const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        if (setPercent) setPercent(percent);
      },
      (err) => {
        // promise reject
        reject(err.code);
      },
      () => {
        getDownloadURL(uploadTask.snapshot.ref).then((url) => {
          resolve(url);
        });
      }
    );
  });
};

/** 차집합 계산 후, 서버에 필요없는 이미지를 삭제하는 함수 */
export function deleteServerImage(quillArray, urlData) {
  console.log('array, 현재 quill에 보여지는 이미지', quillArray);
  console.log('urldata, 현재 서버에 저장된 이미지', urlData);

  const url_DELETE = quillArray
    .filter((x) => !urlData.includes(x))
    .concat(urlData.filter((x) => !quillArray.includes(x)));

  for (let i = 0; i < url_DELETE.length; i++) {
    const httpsRef = ref(storage, url_DELETE[i]);

    deleteObject(httpsRef)
      .then(() => {
        console.log(url_DELETE[i] + ' 파일삭제됨');
      })
      .catch((err) => {
        console.log('에러코드 ' + err.code);
      });
  }
}

export async function uploadData(uploadArray) {
  console.log(uploadArray);

  // 데이터 공백 유효성 검사하기
  for (let i = 0; i < uploadArray.length; i++) {
    if (uploadArray[i]?.value === '' || uploadArray[i] === '' || uploadArray[i]?.length === 0) {
      // 3번, 이미지 데이터가 없을 때, 따로 에러를 return해준다.
      if (i === 3) return { icon: 'error', text: '대표 이미지를 추가해주세요' };

      // object, HTMLELement값이라면 focus를 잡아준다.
      if (typeof uploadArray[i] === 'object') uploadArray[i].focus();

      // 이미지 데이터를 제외한 모든 공백값 부재의 에러는 이곳으로 처리함.
      return { icon: 'error', text: '모든 데이터를 전부 넣어주세요' };
    }
  }

  const date = new Date();

  // 업로드 date
  const upldDate =
    date.getFullYear() +
    ('0' + (date.getMonth() + 1)).slice(-2) +
    ('0' + date.getDate()).slice(-2) +
    ('0' + date.getHours()).slice(-2) +
    ('0' + date.getMinutes()).slice(-2) +
    ('0' + date.getSeconds()).slice(-2) +
    ('0' + date.getMilliseconds()).slice(-2);

  const Items = {
    ItemPKid: createID(), // [상품 ID](PK)
    ItemName: uploadArray[0].value, //  [상품명]
    ItemSmry: uploadArray[1].value, //  [상품 요약설명]
    ItemFbrc: uploadArray[2].value, //  [재질]
    ItemImg1: uploadArray[3][0], // [대표이미지 1]
    ItemImg2: uploadArray[3][1], // [대표이미지 2]
    ItemCntn: calByte.cutByteLength(uploadArray[4].value, 15000), // [상세설명]
    ItemPrce: uploadArray[5].value, // [상품 가격]
    ItemCost: uploadArray[6].value, // [할인 이전 가격]
    ItemOtDt: uploadArray[7], // [옵션 데이터]
    ItemPath: uploadArray[8].textContent, // [카테고리 label]
    ItemMade: uploadArray[9].value, // [원산지]
    ItemMakr: uploadArray[10].value, // [제조사]
    ItemBrnd: uploadArray[11].value, // [브랜드]
    ItemStat: uploadArray[12].value, // [상품 상태(select)]
    ItemMinS: uploadArray[13].value, // [최소 구매수량]
    ItemMaxS: uploadArray[14].value, // [1회 구매시 최대수량]
    ItemMaxB: uploadArray[15].value, // [1인 구매시 최대수량]
    ItemBEST: uploadArray[16].value, // [OUR BEST ITEMS]
    ItemSPCL: uploadArray[17].value, // [SPECIAL ITEMS]
    ItemALSO: uploadArray[18].value, // [ALSO LIKE]
    ItemDate: upldDate,
  };

  console.log(Items.ItemOtDt);

  // try {
  //   const itemsCollectionRef = collection(fireStore, 'shopping_items'); // 'shopping_items' collection 참조 생성

  //   const pathArray = Items.ItemPath.split('>'); // "TOP > 니트" 에서 구분자 '>' 제거

  //   const _res_ = await addDoc(itemsCollectionRef, {
  //     ITEMS_PKID: Items.ItemPKid,
  //     ITEMS_NAME: Items.ItemName,
  //     ITEMS_SUMMARY: Items.ItemSmry,
  //     ITEMS_FABRIC: Items.ItemFbrc,
  //     ITMES_IMG1: Items.ItemImg1,
  //     ITEMS_IMG2: Items.ItemImg2,
  //     ITEMS_CONTENT: Items.ItemCntn,
  //     ITEMS_PRICE: Items.ItemPrce,
  //     ITEMS_COST: Items.ItemCost,
  //     ITEMS_CATE_PARENT: pathArray[0].trim(),
  //     ITEMS_CATE_NAME: pathArray[1].trim(),
  //     ITEMS_MADE: Items.ItemMade,
  //     ITEMS_MAKER: Items.ItemMakr,
  //     ITEMS_BRAND: Items.ItemBrnd,
  //     ITEMS_STATS: Items.ItemStat,
  //     ITEMS_MIN_AMOUNT: Items.ItemMinS,
  //     ITEMS_MAX_AMOUNT: Items.ItemMaxS,
  //     ITEMS_MAX_AMOUNT_BUY: Items.ItemMaxB,
  //     ITEMS_OUR_BEST: Items.ItemBEST,
  //     ITEMS_SPECIAL: Items.ItemSPCL,
  //     ITEMS_ALSO_LIKE: Items.ItemALSO,
  //     ITEMS_UPLD_DATE: Items.ItemDate,
  //   });
  // } catch (e) {
  //   return { icon: 'error', text: '서버에 [상품]을 추가하는 중에 에러가 발생했습니다' };
  // }

  try {
    const optionsCollectionRef = collection(fireStore, 'shopping_option_data'); // 'shopping_option_data' collection 참조 생성

    const batch = fireStore.batch();
    Items.ItemOtDt.forEach((doc, index) => {
      const newDocRef = optionsCollectionRef.doc(`document-${index}`);
      batch.set(newDocRef, doc);
    });

    batch
      .commit()
      .then(() => {
        console.log('성공');
      })
      .catch((err) => {
        console.log('에러', err);
      });
  } catch (e) {
    return {
      icon: 'error',
      text: '서버에 [상품] - [옵션 데이터]를 추가하는 중에 에러가 발생했습니다',
    };
  }
}
