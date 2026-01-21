import { PageContainer } from '@ant-design/pro-components';
import styles from './index.less';

const HomePage: React.FC = () => {
  const name = "lignting";
  return (
    <PageContainer ghost>
      <div className={styles.container}>
          {name}
      </div>
    </PageContainer>
  );
};

export default HomePage;
